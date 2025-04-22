import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({
	providedIn: 'root',
})
export class AuthService {
	private loggedInSource = new BehaviorSubject(false);

	get isLoggedIn(): boolean {
		return this.loggedInSource.getValue() === true;
	}
}
