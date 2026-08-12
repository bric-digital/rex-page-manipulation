export interface REXPageRedirect {
  pattern: string,
  destination: string,
  mode?: 'urlFilter' | 'regex',
  exceptions?: string[],
  url_filter?: string // Temp backward compatibility
}

export interface REXPageElementRuleAction {
  selector: string,
  action: string,
}

export interface REXPageElementAddClassRuleConditionContent {
  source: string,
  name: string,
  transform?: string,
  selector?: string,
}

export interface REXPageElementAddClassRuleCondition {
  operation: string,
  content: REXPageElementAddClassRuleConditionContent,
  use?: number[],
  within_range?: string[],
}

export interface REXPageElementAddClassRuleAction {
  selector: string,
  action: string,
  class_name: string,
  conditions?: REXPageElementAddClassRuleCondition[],
  exceptions?: string[],
  conditions_match?: 'any'|'all'
}

export interface REXPageElementRule {
  base_url: string,
  actions: REXPageElementRuleAction[]|REXPageElementAddClassRuleAction[]
}

export interface REXPageManipulationObscurePage {
  base_url: string,
  delay?: number,
  skip?: string[]
}

export interface REXPageManipulationConfiguration {
  debug?: boolean,
  enabled?: boolean,
  url_redirects?: REXPageRedirect[],
  obscure_page?: REXPageManipulationObscurePage[],
  page_elements?: REXPageElementRule[]
}

export interface REXPageManipulationEvaluateMessage {
  messageType: 'pageManipulationEvaluate',
  condition: REXPageElementAddClassRuleCondition,
  content?: string
}
