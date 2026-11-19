export interface ParserConfig {
  // One detail-type, or several separated by commas.
  detailType: string;
  sourcePrefix: string;
}

export function getParserConfig(): ParserConfig {
  return {
    detailType: process.env.EVENT_DETAIL_TYPE ?? 'Additional_Payment_Event__e',
    sourcePrefix: process.env.EVENT_SOURCE_PREFIX ?? 'aws.partner/salesforce.com/',
  };
}
