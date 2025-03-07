/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { mountWithIntl } from '@kbn/test-jest-helpers';

import { ExceptionsAddToRulesOptions } from '.';
import { TestProviders } from '../../../../../common/mock';
import { useFindRules } from '../../../../../detections/pages/detection_engine/rules/all/rules_table/use_find_rules';
import { getRulesSchemaMock } from '../../../../../../common/detection_engine/schemas/response/rules_schema.mocks';
import type { Rule } from '../../../../../detections/containers/detection_engine/rules/types';

jest.mock('../../../../../detections/pages/detection_engine/rules/all/rules_table/use_find_rules');

describe('ExceptionsAddToRulesOptions', () => {
  beforeEach(() => {
    (useFindRules as jest.Mock).mockReturnValue({
      data: {
        rules: [getRulesSchemaMock(), { ...getRulesSchemaMock(), id: '345', name: 'My rule' }],
        total: 0,
      },
      isFetched: true,
    });
  });

  it('it displays option to add exception to single rule if a single rule is passed in', () => {
    const wrapper = mountWithIntl(
      <TestProviders>
        <ExceptionsAddToRulesOptions
          possibleRules={[getRulesSchemaMock() as Rule]}
          isSingleRule
          isBulkAction={false}
          selectedRadioOption="add_to_rule"
          onRuleSelectionChange={jest.fn()}
          onRadioChange={jest.fn()}
        />
      </TestProviders>
    );

    expect(wrapper.find('[data-test-subj="addToRuleRadioOption"]').exists()).toBeTruthy();
  });

  it('it displays option to add exception to multiple rules if "isBulkAction" is "true" and rules are passed in', () => {
    const wrapper = mountWithIntl(
      <TestProviders>
        <ExceptionsAddToRulesOptions
          possibleRules={[getRulesSchemaMock() as Rule]}
          isSingleRule={false}
          isBulkAction
          selectedRadioOption="add_to_rules"
          onRuleSelectionChange={jest.fn()}
          onRadioChange={jest.fn()}
        />
      </TestProviders>
    );

    expect(wrapper.find('[data-test-subj="addToRulesRadioOption"]').exists()).toBeTruthy();
  });

  it('it displays rules selection table if "isBulkAction" is "true" and rules are passed in', () => {
    const wrapper = mountWithIntl(
      <TestProviders>
        <ExceptionsAddToRulesOptions
          possibleRules={null}
          isSingleRule={false}
          isBulkAction={false}
          selectedRadioOption="select_rules_to_add_to"
          onRuleSelectionChange={jest.fn()}
          onRadioChange={jest.fn()}
        />
      </TestProviders>
    );

    expect(wrapper.find('[data-test-subj="selectRulesToAddToRadioOption"]').exists()).toBeTruthy();
  });
});
