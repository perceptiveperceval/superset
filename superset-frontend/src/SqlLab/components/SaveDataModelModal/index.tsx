/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useCallback, useState, useMemo} from 'react';
import { Radio } from 'src/components/Radio';
import { RadioChangeEvent, AsyncSelect } from 'src/components';
import { Input, TextArea } from 'src/components/Input';
import StyledModal from 'src/components/Modal';
import { Form, FormItem } from 'src/components/Form';
import { Row, Col } from 'src/components';
import Button from 'src/components/Button';
import {
  styled,
  t,
  SupersetClient,
  JsonResponse,
  JsonObject,
  QueryResponse,
  QueryFormData,
} from '@superset-ui/core';
import { useSelector, useDispatch } from 'react-redux';
import moment from 'moment';
import rison from 'rison';
import { createDatasource } from 'src/SqlLab/actions/sqlLab';
import { addDangerToast } from 'src/components/MessageToasts/actions';
import { UserWithPermissionsAndRoles as User } from 'src/types/bootstrapTypes';
import {
  MaterializeRadioState,
  EXPLORE_CHART_DEFAULT,
  DatasetOwner,
  SqlLabExploreRootState,
  getInitialState,
  SqlLabRootState,
} from 'src/SqlLab/types';
import { mountExploreUrl } from 'src/explore/exploreUtils';
import { postFormData } from 'src/explore/exploreUtils/formData';
import { URL_PARAMS } from 'src/constants';
import { SelectValue } from 'antd/lib/select';
import { isEmpty, isString } from 'lodash';
import { addSuccessToast } from 'src/components/MessageToasts/actions';
import { addWarningToast } from 'src/components/MessageToasts/actions';
import useQueryEditor from 'src/SqlLab/hooks/useQueryEditor';
interface QueryDatabase {
  id?: number;
}

export type ExploreQuery = QueryResponse & {
  database?: QueryDatabase | null | undefined;
};

export interface ISimpleColumn {
  name?: string | null;
  type?: string | null;
  is_dttm?: boolean | null;
}

export type Database = {
  backend: string;
  id: number;
  parameter: object;
};

export interface ISaveableDatasource {
  columns: ISimpleColumn[];
  name: string;
  dbId: number;
  sql: string;
  templateParams?: string | object | null;
  schema?: string | null;
  database?: Database;

}

interface SaveDatasetModalProps {
  visible: boolean;
  onHide: () => void;
  buttonTextOnSave: string;
  buttonTextOnOverwrite: string;
  modalDescription?: string;
  datasource: ISaveableDatasource;
  runQueryModel: () => void;
  openWindow?: boolean;
  formData?: Omit<QueryFormData, 'datasource'>;
  handleMaterializationNum: (materializationNum: number) => void;
  allowAsync: boolean;
  queryEditorId: string;
  columns: ISaveableDatasource['columns'];
  handleDescription: (description: string) => void;
  handleModelName: (modelName: string) =>void;
}

const Styles = styled.span`
  span[role='img'] {
    display: flex;
    margin: 0;
    color: ${({ theme }) => theme.colors.grayscale.base};
    svg {
      vertical-align: -${({ theme }) => theme.gridUnit * 1.25}px;
      margin: 0;
    }
  }
`;

const updateDataset = async (
  dbId: number,
  datasetId: number,
  sql: string,
  columns: Array<Record<string, any>>,
  owners: [number],
  overrideColumns: boolean,
) => {
  const endpoint = `api/v1/dataset/${datasetId}?override_columns=${overrideColumns}`;
  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({
    sql,
    columns,
    owners,
    database_id: dbId,
  });

  const data: JsonResponse = await SupersetClient.put({
    endpoint,
    headers,
    body,
  });
  return data.json.result;
};

const UNTITLED = t('Untitled Dataset');

const onClickModel = (
  allowAsync: boolean,
  runQueryModel: (c?: boolean) => void = () => undefined,
): void => {
  console.log("run query model click");
  if (allowAsync) {
    return runQueryModel(true);
  }
  return runQueryModel(false);
};

export const SaveDataModelModal = ({
  visible,
  onHide,
  buttonTextOnSave,
  buttonTextOnOverwrite,
  modalDescription,
  datasource,
  openWindow = true,
  formData = {},
  runQueryModel,
  handleMaterializationNum,
  allowAsync,
  queryEditorId,
  columns,
  handleDescription,
  handleModelName

}: SaveDatasetModalProps) => {
  const queryEditor = useQueryEditor(queryEditorId, [
    'autorun',
    'name',
    'description',
    'remoteId',
    'dbId',
    'latestQueryId',
    'queryLimit',
    'schema',
    'selectedText',
    'sql',
    'tableOptions',
    'templateParams',
  ]);
  const query = useMemo(
    () => ({
      ...queryEditor,
      columns,
    }),
    [queryEditor, columns],
  );
  const defaultLabel = query.name || query.description || t('Undefined');
  const [description, setDescription] = useState<string>(
    query.description || '',
  );

  const [label, setLabel] = useState<string>(defaultLabel);

  const onLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
    handleModelName(e.target.value);
  };

  const onDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    handleDescription(e.target.value);
  };
  
  const [materializationNumRadio, setMaterializationNumRadio] = useState(1);

  const handleMaterializationNumRadio = (materializationNumRadio: number) => {
    handleMaterializationNum(materializationNumRadio)
    setMaterializationNumRadio(materializationNumRadio);
    console.log("materialize num radio");
    console.log(materializationNumRadio);
  };
  // const [materialization, setMaterialization] = useState(
  //   MaterializeRadioState.TABLE,
  // );

  return (
    <StyledModal
      show={visible}
      title={t('Save as dbt\'s Model')}
      onHide={onHide}
      footer={
        <>
          <Button
            buttonStyle="primary"
            onClick={() =>
              {onClickModel(allowAsync, runQueryModel);
              onHide();}
            }
            className="m-r-3"
            cta
          >
            {t('Save as Model')}
          </Button>
        </>
      }
    >
      <Styles>
        { (
          <Form layout="vertical">
            <Row>
              <Col xs={24}>
                <FormItem label={t('Name')}>
                  <Input type="text" value={label} onChange={onLabelChange} />
                </FormItem>
              </Col>
            </Row>
            <br />
            <Row>
              <Col xs={24}>
                <Radio.Group
                  onChange={(e: RadioChangeEvent) => {
                    handleMaterializationNumRadio(Number(e.target.value));
                  }}
                  value={materializationNumRadio}
                >
                  <Radio className="sdm-radio" value={1}>
                    {t('Table')}
                  </Radio>
                  <Radio className="sdm-radio" value={2}>
                    {t('View')}
                  </Radio>
                  <Radio className="sdm-radio" value={3}>
                    {t('Incremental')}
                  </Radio>
                  <Radio className="sdm-radio" value={4}>
                    {t('Ephemereal')}
                  </Radio>
                </Radio.Group>
              </Col>
            </Row>
            <br />
            <Row>
              <Col xs={24}>
                <FormItem label={t('Description')}>
                  <TextArea
                    rows={4}
                    value={description}
                    onChange={onDescriptionChange}
                  />
                </FormItem>
              </Col>
            </Row>
          </Form>   
        )}
      </Styles>
    </StyledModal>
  );
};
