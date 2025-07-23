/**
 * Summary generation types
 */

export interface SummaryData {
  id: string;
  meeting_id: string;
  summary: string;
  summary_type: SummaryType;
  provider: AIProvider;
  model: string;
  generated_at: string;
  quality_score: number;
  processing_time: number;
  chunks_processed?: number;
  structured_data?: StructuredSummary;
  custom_prompt?: string;
}

export type SummaryType = 'structured' | 'brief' | 'detailed' | 'action_items' | 'decisions' | 'custom';

export type AIProvider = 'openai' | 'anthropic' | 'groq' | 'ollama' | 'azure_openai';

export interface StructuredSummary {
  meeting_name?: string;
  overview: string;
  key_topics: Topic[];
  decisions: Decision[];
  action_items: ActionItem[];
  next_steps: NextStep[];
  participants_summary: ParticipantSummary[];
  important_quotes: Quote[];
  follow_up_required: boolean;
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  time_discussed: number; // seconds
  participants: string[];
  importance: 'low' | 'medium' | 'high';
  related_topics?: string[];
}

export interface Decision {
  id: string;
  title: string;
  description: string;
  decision_maker: string;
  rationale?: string;
  impact: 'low' | 'medium' | 'high';
  implementation_deadline?: string;
  dependencies?: string[];
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee: string;
  due_date?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dependencies?: string[];
  estimated_effort?: string;
}

export interface NextStep {
  id: string;
  title: string;
  description: string;
  responsible_party: string;
  target_date?: string;
  prerequisites?: string[];
}

export interface ParticipantSummary {
  name: string;
  speaking_time: number; // seconds
  key_contributions: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  engagement_level: 'low' | 'medium' | 'high';
}

export interface Quote {
  id: string;
  text: string;
  speaker: string;
  context: string;
  timestamp: number;
  importance: 'low' | 'medium' | 'high';
}

export interface SummaryGenerationRequest {
  summary_type: SummaryType;
  provider: AIProvider;
  model: string;
  custom_prompt?: string;
  enable_chunking?: boolean;
  chunk_size?: number;
  chunk_overlap?: number;
  temperature?: number;
  max_tokens?: number;
  include_timestamps?: boolean;
  focus_areas?: string[];
}

export interface SummaryGenerationResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimated_duration: number;
  message: string;
}

export interface SummaryStatusResponse {
  meeting_id: string;
  has_summary: boolean;
  summary_available: boolean;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  last_generated?: string;
  summary_type?: SummaryType;
  provider?: AIProvider;
  model?: string;
  quality_score?: number;
  processing_time?: number;
  chunks_processed?: number;
  error_message?: string;
}

export interface SummaryTypesResponse {
  summary_types: Record<SummaryType, SummaryTypeConfig>;
  supported_providers: Record<AIProvider, ProviderConfig>;
}

export interface SummaryTypeConfig {
  description: string;
  response_model?: string;
  max_length?: number;
  style?: string;
  chunking_enabled: boolean;
  post_processing?: boolean;
  estimated_time_seconds: number;
}

export interface ProviderConfig {
  models: string[];
  default_model: string;
  max_tokens: number;
  supports_streaming: boolean;
  cost_per_1k_tokens: number;
  rate_limit_per_minute: number;
}

export interface SummaryQualityMetrics {
  coherence_score: number; // 0-1
  completeness_score: number; // 0-1
  accuracy_score: number; // 0-1
  relevance_score: number; // 0-1
  readability_score: number; // 0-1
  overall_quality: number; // 0-1
  feedback_provided: boolean;
  user_rating?: number; // 1-5
}