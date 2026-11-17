export interface IndicatorModel {
  readonly label: string;
  readonly detail: string | null;
}

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DrivingIndicator {
  readonly signal: AbortSignal;
  readonly live: () => boolean;
  readonly rect: ScreenRect;
  readonly setDetail: (detail: string | null) => void;
  readonly close: () => void;
}

export interface BackendIndicator {
  readonly show: (model: IndicatorModel) => Promise<DrivingIndicator>;
}

export interface IndicatorApi {
  readonly indicator?: BackendIndicator;
}
