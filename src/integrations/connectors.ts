import type { AuditEvent } from "../governance";
import type { MonitoringAlert } from "../monitoring";
import type { ConnectorPayload, IntegrationConnector } from "./base";

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Connector request failed ${response.status}: ${responseText}`);
  }
}

export interface WebhookConnectorConfig {
  url: string;
  headers?: Record<string, string>;
}

export class WebhookConnector implements IntegrationConnector {
  private url: string;
  private headers: Record<string, string>;

  constructor(config: WebhookConnectorConfig) {
    this.url = config.url;
    this.headers = config.headers ?? {};
  }

  async send(payload: ConnectorPayload): Promise<void> {
    await postJson(this.url, payload, this.headers);
  }
}

export interface DatadogConnectorConfig {
  apiKey: string;
  site?: string;
  titlePrefix?: string;
}

function renderDatadogText(payload: ConnectorPayload): { title: string; text: string; alertType: string } {
  if (payload.kind === "alert") {
    return {
      title: payload.alert.title,
      text: payload.alert.message,
      alertType: payload.alert.severity === "critical" ? "error" : payload.alert.severity
    };
  }

  if (payload.kind === "audit") {
    return {
      title: `Audit event: ${payload.event.type}`,
      text: payload.event.message,
      alertType: payload.event.status === "error" ? "error" : "info"
    };
  }

  return {
    title: "Fireworks++ snapshot",
    text: JSON.stringify(payload.snapshot),
    alertType: "info"
  };
}

export class DatadogConnector implements IntegrationConnector {
  private apiKey: string;
  private site: string;
  private titlePrefix?: string;

  constructor(config: DatadogConnectorConfig) {
    this.apiKey = config.apiKey;
    this.site = config.site ?? "datadoghq.com";
    this.titlePrefix = config.titlePrefix;
  }

  async send(payload: ConnectorPayload): Promise<void> {
    const rendered = renderDatadogText(payload);
    await postJson(
      `https://api.${this.site}/api/v1/events`,
      {
        title: this.titlePrefix ? `${this.titlePrefix}${rendered.title}` : rendered.title,
        text: rendered.text,
        alert_type: rendered.alertType
      },
      {
        "DD-API-KEY": this.apiKey
      }
    );
  }
}

export interface SplunkHECConnectorConfig {
  url: string;
  token: string;
  source?: string;
  sourcetype?: string;
}

export class SplunkHECConnector implements IntegrationConnector {
  private url: string;
  private token: string;
  private source?: string;
  private sourcetype?: string;

  constructor(config: SplunkHECConnectorConfig) {
    this.url = config.url;
    this.token = config.token;
    this.source = config.source;
    this.sourcetype = config.sourcetype;
  }

  async send(payload: ConnectorPayload): Promise<void> {
    await postJson(
      this.url,
      {
        event: payload,
        source: this.source,
        sourcetype: this.sourcetype
      },
      {
        Authorization: `Splunk ${this.token}`
      }
    );
  }
}

export interface KafkaRestConnectorConfig {
  url: string;
  topic: string;
  headers?: Record<string, string>;
}

export class KafkaRestConnector implements IntegrationConnector {
  private url: string;
  private topic: string;
  private headers: Record<string, string>;

  constructor(config: KafkaRestConnectorConfig) {
    this.url = config.url;
    this.topic = config.topic;
    this.headers = config.headers ?? {};
  }

  async send(payload: ConnectorPayload): Promise<void> {
    await postJson(
      `${this.url.replace(/\/$/, "")}/topics/${encodeURIComponent(this.topic)}`,
      {
        records: [{ value: payload }]
      },
      {
        Accept: "application/vnd.kafka.json.v2+json",
        "Content-Type": "application/vnd.kafka.json.v2+json",
        ...this.headers
      }
    );
  }
}

export interface RestConnectorConfig {
  url: string;
  headers?: Record<string, string>;
}

export class RestConnector implements IntegrationConnector {
  private url: string;
  private headers: Record<string, string>;

  constructor(config: RestConnectorConfig) {
    this.url = config.url;
    this.headers = config.headers ?? {};
  }

  async send(payload: ConnectorPayload): Promise<void> {
    await postJson(this.url, payload, this.headers);
  }
}

export interface ConnectorDispatcherConfig {
  connectors?: IntegrationConnector[];
}

export class ConnectorDispatcher {
  private connectors: IntegrationConnector[];

  constructor(config: ConnectorDispatcherConfig = {}) {
    this.connectors = config.connectors ?? [];
  }

  add(connector: IntegrationConnector): void {
    this.connectors.push(connector);
  }

  async dispatch(payload: ConnectorPayload): Promise<void> {
    for (const connector of this.connectors) {
      await connector.send(payload);
    }
  }

  async dispatchAlert(alert: MonitoringAlert): Promise<void> {
    await this.dispatch({ kind: "alert", alert });
  }

  async dispatchAudit(event: AuditEvent): Promise<void> {
    await this.dispatch({ kind: "audit", event });
  }
}

