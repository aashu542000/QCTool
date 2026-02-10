import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { Case, CaseService } from '../../services/case.service';
import { ExportService } from '../../services/export.service';
import { FormsModule } from '@angular/forms'; // For ngModel

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule], // Add imports
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
    @Output() openQc = new EventEmitter<Case | null>();

    cases: Case[] = [];
    filteredCases: Case[] = [];
    searchTerm: string = '';
    selectedCases = new Set<number>();

    // Stats
    totalCases = 0;
    avgScore = 0;
    todayReviews = 0;

    constructor(
        private caseService: CaseService,
        private exportService: ExportService
    ) { }

    ngOnInit(): void {
        this.caseService.cases$.subscribe(cases => {
            this.cases = cases;
            this.filterCases();
            this.updateStats();
        });
    }

    filterCases() {
        const term = this.searchTerm.toLowerCase();
        this.filteredCases = this.cases.filter(c =>
            c.patientName.toLowerCase().includes(term) ||
            c.caseId.toLowerCase().includes(term)
        );
    }

    updateStats() {
        this.totalCases = this.cases.length;
        this.avgScore = this.cases.length > 0
            ? Math.round(this.cases.reduce((sum, c) => sum + (c.score || 0), 0) / this.cases.length)
            : 0;

        const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        this.todayReviews = this.cases.filter(c => c.date === today).length;
    }

    toggleCaseSelection(id: number) {
        if (this.selectedCases.has(id)) {
            this.selectedCases.delete(id);
        } else {
            this.selectedCases.add(id);
        }
    }

    toggleSelectAll(event: any) {
        if (event.target.checked) {
            this.cases.forEach(c => this.selectedCases.add(c.id));
        } else {
            this.selectedCases.clear();
        }
    }

    deleteCase(id: number, event: Event) {
        event.stopPropagation();
        if (confirm('Delete this case?')) {
            this.caseService.deleteCase(id);
            this.selectedCases.delete(id);
        }
    }

    onNewQc() {
        this.openQc.emit(null);
    }

    onEditCase(caseData: Case) {
        this.openQc.emit(caseData);
    }

    exportHTML() {
        // Logic for HTML export similar to original or simplified
        alert("Export to HTML not fully verified in migration yet.");
    }

    exportJSON() {
        // Logic to export selected cases
        const selected = this.cases.filter(c => this.selectedCases.has(c.id));
        if (selected.length === 0) return alert("Select cases to export");
        this.exportService.exportToJSON({ cases: selected }, `export_${Date.now()}.json`);
    }

    exportCSV() {
        const selected = this.cases.filter(c => this.selectedCases.has(c.id));
        if (selected.length === 0) return alert("Select cases to export");
        this.exportService.exportToCSV(selected, `export_${Date.now()}.csv`);
    }
}
