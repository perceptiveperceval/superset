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

import React, { useState, useMemo } from 'react';
import { Radio } from 'src/components/Radio';
import { Input, TextArea } from 'src/components/Input';
import StyledModal from 'src/components/Modal';
import { Form, FormItem } from 'src/components/Form';
import { Row, Col, RadioChangeEvent } from 'src/components';
import Button from 'src/components/Button';
import { styled, t, QueryResponse, QueryFormData } from '@superset-ui/core';
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
  handleModelName: (modelName: string) => void;
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

const regexCheck = /^[a-zA-Z0-9_]{1,63}$/;

const onClickModel = (
  allowAsync: boolean,
  runQueryModel: (c?: boolean) => void = () => undefined,
): void => {
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
  handleModelName,
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

  const [isDisabled, setIsDisabled] = useState(true);

  const onLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
    handleModelName(e.target.value);
    setIsDisabled(!regexCheck.test(e.target.value));
  };

  const onDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    handleDescription(e.target.value);
  };

  const [materializationNumRadio, setMaterializationNumRadio] = useState(1);

  const handleMaterializationNumRadio = (materializationNumRadio: number) => {
    handleMaterializationNum(materializationNumRadio);
    setMaterializationNumRadio(materializationNumRadio);
  };

  return (
    <StyledModal
      show={visible}
      title={t("Save as dbt's Model")}
      onHide={onHide}
      footer={
        <>
          <Button
            buttonStyle="primary"
            onClick={() => {
              onClickModel(allowAsync, runQueryModel);
              onHide();
            }}
            className="m-r-3"
            disabled={isDisabled}
            cta
          >
            {t('Save as Model')}
          </Button>
        </>
      }
    >
      <Styles>
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
      </Styles>
    </StyledModal>
  );
};
