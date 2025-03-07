/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// TODO (Jiawei): Use node builder instead of strings
export const getFilter = ({
  message,
  outcomeFilter,
  runId,
}: {
  message?: string;
  outcomeFilter?: string[];
  runId?: string;
}) => {
  const filter: string[] = [];

  if (message) {
    const escapedMessage = message.replace(/([\)\(\<\>\}\{\"\:\\])/gm, '\\$&');
    filter.push(`message: "${escapedMessage}" OR error.message: "${escapedMessage}"`);
  }

  if (outcomeFilter && outcomeFilter.length) {
    filter.push(getOutcomeFilter(outcomeFilter));
  }

  if (runId) {
    filter.push(`kibana.alert.rule.execution.uuid: ${runId}`);
  }

  return filter;
};

function getOutcomeFilter(outcomeFilter: string[]) {
  const filterMapping: Record<string, string> = {
    failure: 'event.outcome: failure',
    warning: 'kibana.alerting.outcome: warning',
    success:
      'kibana.alerting.outcome:success OR (event.outcome: success AND NOT kibana.alerting.outcome:*)',
    unknown: 'event.outcome: unknown',
  };
  return `${outcomeFilter.map((f) => filterMapping[f]).join(' OR ')}`;
}
