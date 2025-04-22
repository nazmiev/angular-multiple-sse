import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observer, Subject, Subscription } from 'rxjs';
import { Injectable, inject } from '@angular/core';
import { environment } from '../environment';
import { AuthService } from './auth.service';

export type EventSourceMessage<T = unknown> = {
	type: string;
	data: T;
};

class EventSourceQueue {
	private queue: Array<() => Promise<void>> = [];
	public push = (callback: () => Promise<void>) => {
		this.queue.push(async () => {
			await callback();
			await new Promise(resolve => setTimeout(resolve));
			if (this.queue.length >= 1) {
				this.queue.shift();
				if (this.queue.length) {
					this.queue[0]();
				}
			}
		});
		if (this.queue.length == 1) {
			this.queue[0]();
		}
	};
}

const queue = new EventSourceQueue();

abstract class EventSourceService {
	private httpService: HttpClient = inject(HttpClient);
	private authService: AuthService = inject(AuthService);
	private eventSource!: EventSource;
	private eventSubject$ = new Subject<EventSourceMessage>();
	private cache: EventSourceMessage[] = [];
	private reconnectTimeout!: ReturnType<typeof setTimeout>;
	private paused = false;
	protected url = '';
	protected SSEToken!: string;
	static readonly TYPE_OPENED = 'opened';
	protected acceptedTypes = [EventSourceService.TYPE_OPENED];
	private opened = false;

	get serviceUrl(): string {
		return this.url + '?token=' + this.SSEToken;
	}

	private async connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (!this.authService.isLoggedIn) {
				return;
			}
			this.httpService
				.get(environment.serverUrl + '/api/auth/sse/token')
				.subscribe({
					next: (SSEToken: unknown) => {
						this.SSEToken = SSEToken as string;
						this.eventSource = new EventSource(this.serviceUrl);
						this.acceptedTypes.forEach((type: string) => this.addEventListener(type));
						this.eventSource.onerror = () => {
							this.handleError();
						};
						resolve();
					},
					error: (error: HttpErrorResponse) => {
						this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
						if (error.status == 401 || error.status == 504) {
							clearTimeout(this.reconnectTimeout);
						}
						reject();
					},
				});
		});
	}

	public subscribe(
		params: Partial<Observer<EventSourceMessage>> | ((value: EventSourceMessage) => void)
	): Subscription {
		if (!this.opened) {
			queue.push(async () => await this.connect());
			this.opened = true;
		}
		return this.eventSubject$.asObservable().subscribe(params);
	}

	public close(): void {
		clearTimeout(this.reconnectTimeout);
		this.opened = false;
		queue.push(async () => {
			if (this.eventSource) {
				this.eventSource.close();
			}
		});
	}

	public wait(paused: boolean): void {
		this.paused = paused;
		if (!this.paused) {
			for (let message = this.cache.shift(); message; message = this.cache.shift()) {
				this.eventSubject$.next(message);
			}
		}
	}

	private addEventListener(type: string): void {
		this.eventSource.addEventListener(type, event => {
			let data = event.data;
			try {
				data = JSON.parse(event.data);
			} catch {
				// no action needed
			}

			const message = { type: event.type, data } as EventSourceMessage;
			if (this.paused) {
				this.cache.push(message);
			} else {
				this.eventSubject$.next(message);
			}
		});
	}

	private handleError(): void {
		this.close();
		this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
	}
}

@Injectable({
	providedIn: 'root',
})
export class DemoEventService extends EventSourceService {
	protected override acceptedTypes = [
		DemoEventService.TYPE_OPENED,
	];
}