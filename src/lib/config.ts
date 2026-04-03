// ── Types ─────────────────────────────────────────────────────────────────────

export interface CampaignSettings {
  sendGapMinutes: number;         // min_time_btw_emails — gap between individual emails
  trackEmailOpen: boolean;
  trackLinkClick: boolean;
  sendAsPlainText: boolean;
  forcePlainText: boolean;
  stopLeadSettings: "REPLY_TO_AN_EMAIL" | "CLICK_ON_UNSUBSCRIBE" | "OPEN_AN_EMAIL";
  autoPauseDomainLeadsOnReply: boolean;
  ignoreOOOasReply: boolean;
  autoReactivateOOO: boolean;
  reactivateOOOwithDelay: number;
  autoCategorizeOOO: boolean;
}

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  sendGapMinutes: 20,
  trackEmailOpen: false,
  trackLinkClick: false,
  sendAsPlainText: true,
  forcePlainText: true,
  stopLeadSettings: "REPLY_TO_AN_EMAIL",
  autoPauseDomainLeadsOnReply: true,
  ignoreOOOasReply: true,
  autoReactivateOOO: false,
  reactivateOOOwithDelay: 3, // delay mode is default; autoReactivateOOO must be false when this > 0
  autoCategorizeOOO: false,
};

// ── localStorage keys ─────────────────────────────────────────────────────────

const LS_API_KEY = "sl_api_key";
const LS_BASE_URL = "sl_base_url";
const LS_CAMPAIGN_SETTINGS = "sl_campaign_settings";

// ── Loaders / savers ──────────────────────────────────────────────────────────

export function loadApiConfig(): ApiConfig {
  return {
    apiKey:
      localStorage.getItem(LS_API_KEY) ??
      (import.meta.env.VITE_SMARTLEAD_API_KEY as string | undefined) ??
      "",
    baseUrl:
      localStorage.getItem(LS_BASE_URL) ??
      (import.meta.env.VITE_SMARTLEAD_BASE_URL as string | undefined) ??
      "https://server.smartlead.ai/api/v1",
  };
}

export function saveApiConfig(config: ApiConfig) {
  localStorage.setItem(LS_API_KEY, config.apiKey.trim());
  localStorage.setItem(LS_BASE_URL, config.baseUrl.trim());
}

export function loadCampaignSettings(): CampaignSettings {
  try {
    const raw = localStorage.getItem(LS_CAMPAIGN_SETTINGS);
    if (raw) return { ...DEFAULT_CAMPAIGN_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_CAMPAIGN_SETTINGS };
}

export function saveCampaignSettings(settings: CampaignSettings) {
  localStorage.setItem(LS_CAMPAIGN_SETTINGS, JSON.stringify(settings));
}

// ── Converts UI settings model → Smartlead API payload ───────────────────────

export function settingsToApiPayload(s: CampaignSettings) {
  const trackSettings: string[] = [];
  if (!s.trackEmailOpen) trackSettings.push("DONT_TRACK_EMAIL_OPEN");
  if (!s.trackLinkClick) trackSettings.push("DONT_TRACK_LINK_CLICK");

  return {
    track_settings: trackSettings,
    send_as_plain_text: s.sendAsPlainText,
    force_plain_text: s.forcePlainText,
    stop_lead_settings: s.stopLeadSettings,
    auto_pause_domain_leads_on_reply: s.autoPauseDomainLeadsOnReply,
    out_of_office_detection_settings: {
      ignoreOOOasReply: s.ignoreOOOasReply,
      // reactivateOOOwithDelay and autoReactivateOOO are mutually exclusive — delay takes precedence
      autoReactivateOOO: s.reactivateOOOwithDelay > 0 ? false : s.autoReactivateOOO,
      reactivateOOOwithDelay: s.reactivateOOOwithDelay,
      // autoCategorizeOOO and autoReactivateOOO are mutually exclusive
      autoCategorizeOOO: s.autoReactivateOOO ? false : s.autoCategorizeOOO,
    },
  };
}
