import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ExportService {

    constructor() { }

    exportToJSON(data: any, fileName: string) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        this.downloadFile(blob, fileName);
    }

    exportToCSV(data: any[], fileName: string) {
        if (data.length === 0) return;

        // Basic CSV generation based on keys of the first object or custom mapping
        const header = ['Patient Name', 'Case ID', 'Date', 'Score', 'Status', 'Affected Teeth', 'Issues Count', 'Media Count', 'iModify URL', 'Remarks'];
        let csv = header.join(',') + '\n';

        data.forEach(c => {
            const issuesCount = c.issuesMarked ? c.issuesMarked.length : 0;
            const mediaCount = (c.screenshots ? c.screenshots.length : 0) + (c.voiceNotes ? c.voiceNotes.length : 0);
            const remarks = (c.remarks || '').replace(/"/g, '""').replace(/\n/g, ' ');

            const row = [
                `"${c.patientName}"`,
                `"${c.caseId}"`,
                `"${c.date}"`,
                c.score,
                `"${c.status}"`,
                `"${c.affectedTeeth || ''}"`,
                issuesCount,
                mediaCount,
                `"${c.imodifyUrl || ''}"`,
                `"${remarks}"`
            ];
            csv += row.join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        this.downloadFile(blob, fileName);
    }

    exportToHTML(htmlContent: string, fileName: string) {
        const blob = new Blob([htmlContent], { type: 'text/html' });
        this.downloadFile(blob, fileName);
    }

    private downloadFile(blob: Blob, fileName: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    }
}
