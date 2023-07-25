# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
import json
import logging
from typing import Any, Dict

from flask import flash, request, Response
from flask_appbuilder import expose
from flask_appbuilder.api import safe, rison
from flask_appbuilder.security.decorators import permission_name, protect
from flask_wtf.csrf import generate_csrf
from marshmallow import EXCLUDE, fields, post_load, Schema, ValidationError
from marshmallow_enum import EnumField

from superset.embedded_dashboard.commands.exceptions import (
    EmbeddedDashboardNotFoundError,
)
from superset.extensions import event_logger
from superset.models.ab_user import AboutUser
from superset.security.guest_token import GuestTokenResourceType
from superset.superset_typing import FlaskResponse
from superset.tasks.utils import get_current_user
from superset.views.base import json_success
from superset.views.base_api import BaseSupersetApi, statsd_metrics
from superset.utils import core as utils
from superset import db
from superset.annotation_layers.schemas import get_delete_ids_schema

logger = logging.getLogger(__name__)


class PermissiveSchema(Schema):
    """
    A marshmallow schema that ignores unexpected fields, instead of throwing an error.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        unknown = EXCLUDE


class UserSchema(PermissiveSchema):
    username = fields.String()
    first_name = fields.String()
    last_name = fields.String()


class ResourceSchema(PermissiveSchema):
    type = EnumField(GuestTokenResourceType, by_value=True, required=True)
    id = fields.String(required=True)

    @post_load
    def convert_enum_to_value(  # pylint: disable=no-self-use
        self, data: Dict[str, Any], **kwargs: Any  # pylint: disable=unused-argument
    ) -> Dict[str, Any]:
        # we don't care about the enum, we want the value inside
        data["type"] = data["type"].value
        return data


class RlsRuleSchema(PermissiveSchema):
    dataset = fields.Integer()
    clause = fields.String(required=True)  # todo other options?


class GuestTokenCreateSchema(PermissiveSchema):
    user = fields.Nested(UserSchema)
    resources = fields.List(fields.Nested(ResourceSchema), required=True)
    rls = fields.List(fields.Nested(RlsRuleSchema), required=True)


class GetEmailSchema(PermissiveSchema):
    user_ids = fields.List(fields.Integer())


class GetEmailMailsResponseSchema(Schema):
    id = fields.Integer(description="The user's id")
    desc = fields.String(description="The user's email")


class GetEmailResponseSchema(PermissiveSchema):
    emails = fields.List(
        fields.Nested(GetEmailMailsResponseSchema),
        description="A list of user ids and their emails",
    )


class NoticeSchema(PermissiveSchema):
    name = fields.String()
    status = fields.String()
    exception = fields.String()


guest_token_create_schema = GuestTokenCreateSchema()
email_create_schema = GetEmailSchema()
notice_schema = NoticeSchema()


class SecurityRestApi(BaseSupersetApi):
    resource_name = "security"
    allow_browser_login = True
    openapi_spec_tag = "Security"

    @expose("/csrf_token/", methods=["GET"])
    @event_logger.log_this
    @protect()
    @safe
    @statsd_metrics
    @permission_name("read")
    def csrf_token(self) -> Response:
        """
        Return the csrf token
        ---
        get:
          description: >-
            Fetch the CSRF token
          responses:
            200:
              description: Result contains the CSRF token
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                        result:
                          type: string
            401:
              $ref: '#/components/responses/401'
            500:
              $ref: '#/components/responses/500'
        """
        return self.response(200, result=generate_csrf())

    @expose("/guest_token/", methods=["POST"])
    @event_logger.log_this
    @protect()
    @safe
    @statsd_metrics
    @permission_name("grant_guest_token")
    def guest_token(self) -> Response:
        """Response
        Returns a guest token that can be used for auth in embedded Superset
        ---
        post:
          description: >-
            Fetches a guest token
          requestBody:
            description: Parameters for the guest token
            required: true
            content:
              application/json:
                schema: GuestTokenCreateSchema
          responses:
            200:
              description: Result contains the guest token
              content:
                application/json:
                  schema: GetEmailResponseSchema
            401:
              $ref: '#/components/responses/401'
            400:
              $ref: '#/components/responses/400'
            500:
              $ref: '#/components/responses/500'
        """
        try:
            body = guest_token_create_schema.load(request.json)
            self.appbuilder.sm.validate_guest_token_resources(body["resources"])

            # todo validate stuff:
            # make sure username doesn't reference an existing user
            # check rls rules for validity?
            token = self.appbuilder.sm.create_guest_access_token(body["user"], body["resources"], body["rls"])
            return self.response(200, token=token)
        except EmbeddedDashboardNotFoundError as error:
            return self.response_400(message=error.message)
        except ValidationError as error:
            return self.response_400(message=error.messages)

    @event_logger.log_this
    @protect()
    @safe
    @statsd_metrics
    @rison(get_delete_ids_schema)
    @expose("/get_email/", methods=["GET"])
    def get_email(self, **kwargs: Any) -> Response:
        """Response
        Returns users' id and their corresponding email from Superset metadatabase
        ---
        get:
          description: >-
            Fetches users' emails from ids
          parameters:
          - in: query
            name: user_ids
            description: User IDs to fetch mails for
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/get_delete_ids_schema'
          responses:
            200:
              description: Result containing users email
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      emails:
                        type: object
                        properties: {
                          id: {
                            type: integer
                          },
                          mail: {
                            type: string
                          }
                        }

            401:
              $ref: '#/components/responses/401'
            400:
              $ref: '#/components/responses/400'
            500:
              $ref: '#/components/responses/500'
        """
        ids = kwargs["rison"]
        try:
            query = (
                db.session.query(AboutUser).filter(AboutUser.id.in_(ids))
                # .with_entities(AboutUser.email)
            )
            emails = [{r.id: r.email} for r in query]

            # payload = {
            #     "email": query.email
            # }
            # print(query)
            return self.response(200, emails=emails)
        except ValidationError as error:
            return self.response_400(message=error.messages)
