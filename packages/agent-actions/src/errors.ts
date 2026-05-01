export class AdapterError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = new.target.name;
	}
}

export class AdapterPermissionDenied extends AdapterError {}

export class AdapterCapExceeded extends AdapterError {}

export class AdapterUnsupportedChain extends AdapterError {}

export class AdapterUpstreamError extends AdapterError {}
