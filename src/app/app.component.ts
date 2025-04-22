import { Component, OnInit, signal, WritableSignal } from '@angular/core';
import { environment } from './environment';
import { DatePipe } from '@angular/common';

@Component({
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  selector: 'app-root',
  imports: [DatePipe],
})
export class AppComponent implements OnInit {
  protected messages: WritableSignal<{ testing: boolean, sse_dev: string, msg: string, now: number }[]>
    = signal([]);

  ngOnInit(): void {
    const evtSource = new EventSource(environment.serverUrl);
    evtSource.onmessage = (event) => {
      var dataobj = JSON.parse(event.data);
      this.messages.update(value => [dataobj, ...value])
    }
  }
}
