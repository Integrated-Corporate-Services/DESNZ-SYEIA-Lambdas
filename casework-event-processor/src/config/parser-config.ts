export interface ParserConfig {
  detailType: string;
  sourcePrefix: string;
}

export function getParserConfig(): ParserConfig {
  return {
    detailType: process.env.EVENT_DETAIL_TYPE ?? 'Casework_Event__e',
    sourcePrefix: process.env.EVENT_SOURCE_PREFIX ?? 'aws.partner/salesforce.com/',
  };
}