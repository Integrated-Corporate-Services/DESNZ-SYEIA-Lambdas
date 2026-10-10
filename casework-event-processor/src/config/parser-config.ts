export interface ParserConfig {
  detailType: string;
  sourcePrefix: string;
}

export function getParserConfig(): ParserConfig {
  return {
    detailType: process.env.EVENT_DETAIL_TYPE ?? 'Domain_Event__e',
    sourcePrefix: process.env.EVENT_SOURCE_PREFIX ?? 'aws.partner/example-partner.com/',
  };
}