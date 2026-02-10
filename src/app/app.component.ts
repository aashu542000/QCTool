import { Component } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { QcModalComponent } from './features/qc-modal/qc-modal.component';
import { Case, CaseService } from './services/case.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DashboardComponent, QcModalComponent], // Add imports
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  constructor() { }
}
