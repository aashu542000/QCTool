import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Case, CaseService } from '../../services/case.service';
import html2canvas from 'html2canvas'; // Import the library

@Component({
    selector: 'app-qc-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './qc-modal.component.html',
    styleUrls: ['./qc-modal.component.css']
})
export class QcModalComponent implements OnInit, OnDestroy {
    @ViewChild('snapshotTarget') snapshotTarget!: ElementRef;
    currentCase!: Case;
    currentTab: string = 'treatment_plan';
    objectKeys = Object.keys;
    displayScore: number = 100;
    private scoreInterval: any;

    // Viewer
    viewerSafeUrl: SafeResourceUrl | undefined;
    latestAudioUrl: string = '';
    currentAzureCredentials: any = null;
    currentFolderPath: string = '';
    loginUser: string = 'Ketan';

    // Audio Recording
    mediaRecorder: MediaRecorder | null = null;
    isRecording = false;
    recordingTime = '0:00';
    private recordingTimer: any;
    private audioChunks: Blob[] = [];

    // Screen Recording
    screenRecorder: MediaRecorder | null = null;
    isScreenRecording = false;
    screenRecordingTime = 'REC 0:00';
    private screenTimer: any;
    private screenChunks: Blob[] = [];

    constructor(
        public caseService: CaseService,
        private sanitizer: DomSanitizer,
        private cdr: ChangeDetectorRef,
        private route: ActivatedRoute
    ) { }

    ngOnInit(): void {
        this.resetForm();
        this.route.queryParams.subscribe(params => {
            const impressionNo = params['ImpressionNo'] || params['impressionno'];
            if (impressionNo) {
                this.currentCase.caseId = impressionNo;
                this.loadApiData(impressionNo);
            }

            const loginUser = params['LoginUser'] || params['loginuser'];
            if (loginUser) {
                this.loginUser = loginUser;
            }
        });
    }

    // ... (existing code)


    resetForm() {
        const current = this.currentCase || {};

        this.currentCase = {
            id: Date.now(),
            patientName: current.patientName || '',
            caseId: current.caseId || '',
            date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
            score: 100,
            status: 'Draft',
            affectedTeeth: '',
            imodifyUrl: current.imodifyUrl || 'https://3dviewer.illusionaligners.com/index.html?mlink=https://3dviewer.illusionaligners.com/Client4758/IA-5-29087/CE284CB44D2E4D858F5CEF8C3DC59070.iiwgl&fg=f00&bg=fff&p=IOOHJK',
            issuesMarked: [],
            subIssuesMarked: {},
            remarks: '',
            voiceNotes: [],
            screenshots: [],
            uploadedFiles: current.uploadedFiles || []
        };
        this.viewerSafeUrl = undefined;
        this.displayScore = 100;
        this.updateScore();
        this.currentTab = 'treatment_plan';
        this.currentAzureCredentials = null;
        this.currentFolderPath = '';

        // Optional: Auto-load if needed, but user asked to 'create a getapi'
    }

    ngOnDestroy(): void {
        this.stopRecording();
        this.stopScreenRecording();
    }

    switchTab(tab: string) {
        this.currentTab = tab;
    }

    toggleIssue(issueId: string) {
        const index = this.currentCase.issuesMarked.indexOf(issueId);
        if (index > -1) {
            this.currentCase.issuesMarked.splice(index, 1);
            // Optional: clear sub-issues if parent issue is unchecked
            delete this.currentCase.subIssuesMarked[issueId];
        } else {
            this.currentCase.issuesMarked.push(issueId);
        }
        this.updateScore();
    }

    toggleSubIssue(issueId: string, subIssue: string) {
        if (!this.currentCase.subIssuesMarked[issueId]) {
            this.currentCase.subIssuesMarked[issueId] = [];
        }
        const index = this.currentCase.subIssuesMarked[issueId].indexOf(subIssue);
        if (index > -1) {
            this.currentCase.subIssuesMarked[issueId].splice(index, 1);
        } else {
            this.currentCase.subIssuesMarked[issueId].push(subIssue);
        }
    }

    updateScore() {
        const targetScore = this.caseService.calculateScore(this.currentCase.issuesMarked);
        this.currentCase.score = targetScore;
        this.animateScore(targetScore);
    }

    animateScore(target: number) {
        if (this.scoreInterval) clearInterval(this.scoreInterval);

        const step = () => {
            if (this.displayScore === target) {
                clearInterval(this.scoreInterval);
                return;
            }

            const diff = target - this.displayScore;
            const increment = diff > 0 ? 1 : -1;

            this.displayScore += increment;
            this.cdr.detectChanges();
        };

        this.scoreInterval = setInterval(step, 20); // 20ms for smooth feel
    }

    loadViewer() {
        if (this.currentCase.imodifyUrl) {
            this.viewerSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.currentCase.imodifyUrl);
        }
    }

    // --- Voice Recording ---
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            try {
                // 1. Get Folder Path first (awaiting it to avoid race condition)
                console.log('Fetching folder path...');
                const res: any = await firstValueFrom(this.caseService.getFolderPath(6));
                console.log('Folder path fetched:', res);

                if (res) {
                    this.handleFolderPathResponse(res);
                }

                console.log('Final Resolved Folder Path:', this.currentFolderPath);
                console.log('Final Resolved Azure Credentials:', this.currentAzureCredentials);

                // 2. Start Recording
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaRecorder = new MediaRecorder(stream);
                this.audioChunks = [];

                this.mediaRecorder.ondataavailable = (e) => this.audioChunks.push(e.data);
                this.mediaRecorder.onstop = () => {
                    const blob = new Blob(this.audioChunks, { type: 'audio/wav' });
                    this.saveVoiceNote(blob);
                    stream.getTracks().forEach(t => t.stop());
                };

                this.mediaRecorder.start();
                this.isRecording = true;
                this.startTimer();
            } catch (err) {
                alert('Microphone access denied');
            }
        }
    }

    stopRecording() {
        this.recordingTime = '0:00';
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            clearInterval(this.recordingTimer);
        }
    }

    startTimer() {
        let sec = 0;
        this.recordingTimer = setInterval(() => {
            sec++;
            const min = Math.floor(sec / 60);
            const s = sec % 60;
            this.recordingTime = `${min}:${s.toString().padStart(2, '0')}`;
            this.cdr.detectChanges(); // Ensure timer updates
        }, 1000);
    }

    saveVoiceNote(blob: Blob) {
        // 1. Local Preview (Base64)
        const reader = new FileReader();
        reader.onloadend = () => {
            const tempNote = {
                id: Date.now(),
                data: reader.result,
                url: '',
                timestamp: new Date().toISOString(),
                uploading: true
            };
            this.currentCase.voiceNotes.push(tempNote);
            this.cdr.detectChanges();

            // 2. Upload to Azure Blob using the pre-fetched folder path and credentials
            this.caseService.uploadToAzureBlob(blob, this.currentFolderPath, this.currentAzureCredentials).then(url => {
                console.log('Audio uploaded to Azure:', url);
                tempNote.url = url;
                tempNote.uploading = false;
                this.latestAudioUrl = url;
                this.cdr.detectChanges();
            }).catch(err => {
                console.error('Azure upload failed:', err);
                tempNote.uploading = false;
                this.cdr.detectChanges();
            });
        };
        reader.readAsDataURL(blob);
    }

    deleteVoiceNote(index: number) {
        if (confirm('Are you sure you want to delete this recording?')) {
            const deletedNote = this.currentCase.voiceNotes[index];
            this.currentCase.voiceNotes.splice(index, 1);

            // If we deleted the "latest" one, clear or update the latest pointer
            if (deletedNote.url === this.latestAudioUrl) {
                this.latestAudioUrl = this.getLatestVoiceNoteUrl();
            }

            this.cdr.detectChanges();
        }
    }

    // --- Screen Recording ---
    async toggleScreenRecording() {
        if (this.isScreenRecording) {
            this.stopScreenRecording();
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                this.screenRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                this.screenChunks = [];

                this.screenRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) this.screenChunks.push(e.data);
                };

                this.screenRecorder.onstop = () => {
                    const blob = new Blob(this.screenChunks, { type: 'video/webm' });
                    this.saveScreenRecording(blob);
                    stream.getTracks().forEach(t => t.stop());
                };

                this.screenRecorder.start();
                this.isScreenRecording = true;
                this.startScreenTimer();
            } catch (err) {
                console.error(err);
                alert('Screen recording failed or denied');
            }
        }
    }

    stopScreenRecording() {
        if (this.screenRecorder && this.isScreenRecording) {
            this.screenRecorder.stop();
            this.isScreenRecording = false;
            clearInterval(this.screenTimer);
        }
    }

    startScreenTimer() {
        let sec = 0;
        this.screenTimer = setInterval(() => {
            sec++;
            const min = Math.floor(sec / 60);
            const s = sec % 60;
            this.screenRecordingTime = `REC ${min}:${s.toString().padStart(2, '0')}`;
            this.cdr.detectChanges(); // Ensure timer updates
        }, 1000);
    }

    async saveScreenRecording(blob: Blob) {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const tempMedia = {
                id: Date.now(),
                type: 'video',
                data: reader.result,
                url: '',
                filename: 'screen-recording.webm',
                timestamp: new Date().toISOString(),
                uploading: true
            };
            this.currentCase.screenshots.push(tempMedia);
            this.cdr.detectChanges();

            try {
                // Ensure credentials present
                if (!this.currentAzureCredentials) {
                    const res: any = await firstValueFrom(this.caseService.getFolderPath(6));
                    this.handleFolderPathResponse(res);
                }

                const url = await this.caseService.uploadToAzureBlob(blob, this.currentFolderPath, this.currentAzureCredentials);
                tempMedia.url = url;
                tempMedia.uploading = false;
                this.cdr.detectChanges();
                console.log('Screen recording uploaded to Azure:', url);
            } catch (err) {
                console.error('Screen recording upload failed:', err);
                tempMedia.uploading = false;
                this.cdr.detectChanges();
            }
        };
        reader.readAsDataURL(blob);
    }

    handleFolderPathResponse(res: any) {
        // Extremely robust: look for credentials anywhere in the response
        const findCreds = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return null;
            const keys = Object.keys(obj).map(k => k.toLowerCase());
            if (keys.includes('sastoken') || keys.includes('sas')) return obj;

            for (const k in obj) {
                const found = findCreds(obj[k]);
                if (found) return found;
            }
            return null;
        };

        this.currentAzureCredentials = findCreds(res) || res;

        // Folder path extraction
        const findPath = (obj: any): string => {
            if (!obj || typeof obj !== 'object') return '';
            if (obj.FolderPath || obj.folderPath) return obj.FolderPath || obj.folderPath;
            if (Array.isArray(obj.Data)) return findPath(obj.Data[0]);
            if (obj.Data && typeof obj.Data === 'object') return findPath(obj.Data);
            return '';
        };
        this.currentFolderPath = findPath(res) || (typeof res.Data === 'string' ? res.Data : '');
    }

    // --- Screenshots ---
    async captureScreenshot() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { mediaSource: 'screen' } } as any);
            const video = document.createElement('video');
            video.srcObject = stream;

            video.onloadedmetadata = () => {
                video.play();
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(video, 0, 0);
                stream.getTracks().forEach(t => t.stop());

                canvas.toBlob(async (blob) => {
                    if (!blob) return;

                    const dataUrl = canvas.toDataURL('image/png');
                    const tempMedia = {
                        id: Date.now(),
                        type: 'image',
                        data: dataUrl,
                        url: '',
                        filename: 'capture.png',
                        timestamp: new Date().toISOString(),
                        uploading: true
                    };
                    this.currentCase.screenshots.push(tempMedia);
                    this.cdr.detectChanges();

                    try {
                        if (!this.currentAzureCredentials) {
                            const res: any = await firstValueFrom(this.caseService.getFolderPath(6));
                            this.handleFolderPathResponse(res);
                        }

                        const url = await this.caseService.uploadToAzureBlob(blob, this.currentFolderPath, this.currentAzureCredentials);
                        tempMedia.url = url;
                        tempMedia.uploading = false;
                        this.cdr.detectChanges();
                    } catch (err) {
                        console.error('Screenshot upload failed:', err);
                        tempMedia.uploading = false;
                        this.cdr.detectChanges();
                    }
                }, 'image/png');
            };
        } catch (error) {
            alert('Screenshot failed');
        }
    }

    handleFileInput(event: any) {
        const files = event.target.files;
        Array.from(files).forEach(async (file: any) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const type = file.type.startsWith('video') ? 'video' : 'image';
                const tempMedia = {
                    id: Date.now(),
                    type: type,
                    data: reader.result,
                    url: '',
                    filename: file.name,
                    timestamp: new Date().toISOString(),
                    uploading: true
                };
                this.currentCase.screenshots.push(tempMedia);
                this.cdr.detectChanges();

                try {
                    if (!this.currentAzureCredentials) {
                        const res: any = await firstValueFrom(this.caseService.getFolderPath(6));
                        this.handleFolderPathResponse(res);
                    }

                    const url = await this.caseService.uploadToAzureBlob(file, this.currentFolderPath, this.currentAzureCredentials, file.name);
                    tempMedia.url = url;
                    tempMedia.uploading = false;
                    this.cdr.detectChanges();
                } catch (err) {
                    console.error('File upload failed:', err);
                    tempMedia.uploading = false;
                    this.cdr.detectChanges();
                }
            };
            reader.readAsDataURL(file);
        });
    }

    deleteScreenshot(index: number) {
        this.currentCase.screenshots.splice(index, 1);
        this.cdr.detectChanges();
    }

    // --- Actions ---
    // --- Actions ---
    generatePayload(QCStatus: string) {
        const score = this.currentCase.score;
        const statusLabel = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Poor';

        // Helper to get issue state (boolean or object with sub-issues)
        const getIssueState = (id: string, hasSubIssues: boolean = false) => {
            const isMarked = this.currentCase.issuesMarked.includes(id);
            if (hasSubIssues) {
                return {
                    marked: isMarked,
                    subIssues: isMarked ? (this.currentCase.subIssuesMarked[id] || []) : []
                };
            }
            return isMarked;
        };

        const payload = {
            "SSCID": 0,
            "ModuleName": "PPTJobEntryQC",
            "ActionTypeID": 1,
            "PatientID": this.currentCase.patientName || "",
            "ImpressionNo": this.currentCase.caseId || "",
            "affectedTeeth": this.currentCase.affectedTeeth || "",
            "Percentage": score,
            "Status": statusLabel,
            "QCStatus" : QCStatus,
            "issues": {
                "TreatmentPlan": {
                    "TreatmentPlanIncorrect": getIssueState('plan_incorrect', true),
                    "ArchFormNotCoordinated": getIssueState('arch_not_coord'),
                    "BoltonDiscrepancyNotAddressed": getIssueState('bolton_discrepancy')
                },
                "ToothMovement": {
                    "ExcessTipping": getIssueState('excess_tipping'),
                    "InclinationCouldBeBetter": getIssueState('inclination_poor'),
                    "Angulation/RotationCorrectionsNeeded": getIssueState('rotation_issues'),
                    "MidlinesNotMatched": getIssueState('midlines_not_matched'),
                    "IntrusionMovementNeeded": getIssueState('intrusion_needed'),
                    "ExtrusionMovementNeeded": getIssueState('extrusion_needed')
                },
                "StagingAndBiomechanics": {
                    "UnnecessaryRoundTripping": getIssueState('round_tripping'),
                    "StagingIssues": getIssueState('staging_issues'),
                    "CollisionObserved": getIssueState('collision_observed'),
                    "MovementVelocityTooHigh": getIssueState('velocity_high'),
                    "OvercorrectionNeeded": getIssueState('overcorrection')
                },
                "Occlusion": {
                    "ExcessOverjet": getIssueState('excess_overjet'),
                    "OverbiteImprovementNeeded": getIssueState('overbite_poor'),
                    "IntercuspationImprovementNeeded": getIssueState('intercuspation_poor'),
                    "OcclusalCantPresent": getIssueState('occlusal_cant'),
                    "CrossbiteNotFullyCorrected": getIssueState('crossbite')
                },
                "IPRAndAttachments": {
                    "IPRDistributionIssue": getIssueState('ipr_distribution', true),
                    "AttachmentPlacementIssue": getIssueState('attachment_issue', true)
                },
                "DoctorInstructions": {
                    "InstructionsNotFollowed": getIssueState('instructions_not_followed'),
                    "InstructionsPartiallyFollowed": getIssueState('instructions_partial')
                }
            },
            "Remark": this.currentCase.remarks || "",
            "date": this.currentCase.date,
            "LoginUser": this.loginUser,
            "iModifyUrl": this.currentCase.imodifyUrl || "",
            "VoiceNoteUrl": this.getLatestVoiceNoteUrl(),
            "ScreenRecordingUrl": this.getLatestScreenRecordingUrl(),
            "SnapshotUrl": this.currentCase.SnapshotUrl || "", 
            "FileCollections": [
                ...(this.currentCase.voiceNotes || []).filter(n => n.url).map(n => ({
                    FilePath: n.url,
                    FileType: 'Audio'
                })),
                ...(this.currentCase.screenshots || []).filter(s => s.url).map(s => ({
                    FilePath: s.url,
                    FileType: s.type === 'video' ? 'Video' : 'Image'
                }))
            ]
        };
        return payload;
    }

    getLatestVoiceNoteUrl(): string {
        if (this.latestAudioUrl) return this.latestAudioUrl;

        // Fallback: check if we have any voice notes with URLs
        const notesWithUrls = this.currentCase.voiceNotes?.filter(n => n.url);
        if (notesWithUrls && notesWithUrls.length > 0) {
            return notesWithUrls[notesWithUrls.length - 1].url;
        }

        return "";
    }

    getLatestScreenRecordingUrl(): string {
        const videosWithUrls = this.currentCase.screenshots?.filter(s => s.type === 'video' && s.url);
        if (videosWithUrls && videosWithUrls.length > 0) {
            return videosWithUrls[videosWithUrls.length - 1].url;
        }
        return '';
    }

    async saveDraft() {
        this.currentCase.status = 'Draft';
        this.caseService.saveCase(this.currentCase);

        console.log('Capturing issue snapshot...');
       await this.capturePanelSnapshot();

        const payload = this.generatePayload('Draft');
        console.log('Save Draft Payload:', payload);

        this.caseService.saveCaseToApi(payload).subscribe({
            next: (response: any) => {
                console.log('API Response:', response);
                alert('Case saved as Draft and sent to API!');
            },
            error: (error: any) => {
                console.error('API Error:', error);
                alert('Case saved locally, but API call failed. Check console for details.');
            }
        });
    }

    completeQc() {
        this.currentCase.status = 'Completed';
        this.caseService.saveCase(this.currentCase);

        const payload = this.generatePayload('QC Completed');
        console.log('Complete QC Payload:', payload);

        this.caseService.saveCaseToApi(payload).subscribe({
            next: (response: any) => {
                console.log('API Response:', response);
                alert('QC Completed and Saved to API!');
                this.resetForm();
            },
            error: (error: any) => {
                console.error('API Error:', error);
                alert('QC Completed locally, but API call failed. Check console for details.');
                this.resetForm();
            }
        });
    }

    onCancel() {
        if (confirm('Are you sure you want to reset the form? Unsaved changes will be lost.')) {
            this.resetForm();
        }
    }

    getIssuesForCategory(categoryKey: string) {
        return this.caseService.issuesData[categoryKey].issues;
    }

    getSuggestions() {
        return this.currentCase.issuesMarked
            .map(id => this.caseService.suggestionsMap[id])
            .filter(s => s);
    }

    getIdentifiedIssues() {
        let identified: any[] = [];
        this.currentCase.issuesMarked.forEach(id => {
            for (const cat in this.caseService.issuesData) {
                const issue = this.caseService.issuesData[cat].issues.find((i: any) => i.id === id);
                if (issue) identified.push(issue);
            }
        });
        return identified;
    }

    // --- Payload Binding ---
    populateFromPayload(payload: any) {
        if (!payload) return;
        console.log('Populating from payload:', payload);

        // Capture existing sensitive fields to prevent wipe
        const existingId = this.currentCase.caseId;
        const defaultUrl = this.currentCase.imodifyUrl;

        // Reset current case
        this.resetForm();

        // 1. Bind Basic Fields
        // Mapping as per sample: PatientID -> Patient Name, ImpressionNo -> Case ID
        this.currentCase.patientName = payload.PatientID || "";
        this.currentCase.caseId = payload.ImpressionNo || existingId || "";
        this.currentCase.affectedTeeth = payload.affectedTeeth || "";

        // Robust mapping for iModifyUrl (case-insensitive)
        this.currentCase.imodifyUrl = payload.iModifyUrl || payload.imodifyUrl || defaultUrl;
        this.currentCase.remarks = payload.Remark || "";

        // 2. Reverse Mapping Dictionary
        const issueMap: { [key: string]: string } = {
            "TreatmentPlanIncorrect": "plan_incorrect",
            "ArchFormNotCoordinated": "arch_not_coord",
            "BoltonDiscrepancyNotAddressed": "bolton_discrepancy",
            "ExcessTipping": "excess_tipping",
            "InclinationCouldBeBetter": "inclination_poor",
            "Angulation/RotationCorrectionsNeeded": "rotation_issues",
            "MidlinesNotMatched": "midlines_not_matched",
            "IntrusionMovementNeeded": "intrusion_needed",
            "ExtrusionMovementNeeded": "extrusion_needed",
            "UnnecessaryRoundTripping": "round_tripping",
            "RoundTripping": "round_tripping",
            "StagingIssues": "staging_issues",
            "CollisionObserved": "collision_observed",
            "MovementVelocityTooHigh": "velocity_high",
            "OvercorrectionNeeded": "overcorrection",
            "ExcessOverjet": "excess_overjet",
            "OverbiteImprovementNeeded": "overbite_poor",
            "IntercuspationImprovementNeeded": "intercuspation_poor",
            "OcclusalCantPresent": "occlusal_cant",
            "CrossbiteNotFullyCorrected": "crossbite",
            "IPRDistributionIssue": "ipr_distribution",
            "AttachmentPlacementIssue": "attachment_issue",
            "InstructionsNotFollowed": "instructions_not_followed",
            "InstructionsPartiallyFollowed": "instructions_partial"
        };

        const processObject = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;

            for (const key in obj) {
                const value = obj[key];
                const internalId = issueMap[key];

                if (internalId) {
                    let isMarked = false;
                    let subIssues: string[] = [];

                    if (typeof value === 'boolean') {
                        isMarked = value;
                    } else if (typeof value === 'object' && value !== null) {
                        isMarked = value.marked === true;
                        if (value.subIssues && Array.isArray(value.subIssues)) {
                            subIssues = value.subIssues;
                        }
                    }

                    if (isMarked) {
                        if (this.currentCase.issuesMarked.indexOf(internalId) === -1) {
                            this.currentCase.issuesMarked.push(internalId);
                        }
                        if (subIssues.length > 0) {
                            this.currentCase.subIssuesMarked[internalId] = subIssues;
                        }
                    }
                } else if (typeof value === 'object' && value !== null) {
                    processObject(value);
                } else if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
                    try {
                        const parsedJSON = JSON.parse(value);
                        processObject(parsedJSON);
                    } catch (e) {
                        // Not JSON or parse error, skip
                    }
                }
            }
        };

        // Scan the entire payload recursively
        processObject(payload);

        // 3. Bind FileCollections (Audio, Video, Image)
        // Check for 'FileCollection' (singular) as per user JSON or 'FileCollections' (plural) as per generation
        // Also handle lowercase variants just in case
        const files = payload.FileCollection || payload.FileCollections || payload.fileCollection || payload.fileCollections;
        console.log('Files Binding - Found:', files);

        // Always initialize arrays to ensure we start clean or overwrite
        // Since resetForm() was called earlier, they are likely empty, but let's be explicit
        const newVoiceNotes: any[] = [];
        const newScreenshots: any[] = [];

        if (files && Array.isArray(files)) {
            files.forEach((file: any) => {
                let rawType = file.FileType || file.fileType || file.filetype || '';
                let fileType = String(rawType).toLowerCase();

                const filePath = file.FilePath || file.filePath || file.filepath || file.Url || file.url || '';

                console.log(`Processing file: Type=${fileType}, Path=${filePath}`);

                if (!filePath) return;

                // Fallback: Infer type from extension
                if (!fileType || fileType === 'undefined' || fileType === 'null' || fileType === '') {
                    const ext = filePath.split('.').pop()?.toLowerCase();
                    if (ext) {
                        if (['wav', 'mp3', 'ogg', 'm4a'].includes(ext)) fileType = 'audio';
                        else if (['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(ext)) fileType = 'image';
                        else if (['mp4', 'webm', 'mov'].includes(ext)) fileType = 'video';
                        console.log(`Inferred type from extension .${ext}: ${fileType}`);
                    }
                }

                if (fileType.includes('audio')) {
                    newVoiceNotes.push({
                        id: Date.now() + Math.random(),
                        data: filePath, // Remote URL
                        url: filePath,
                        timestamp: new Date().toISOString(),
                        uploading: false,
                        isRemote: true
                    });
                } else if (fileType.includes('image') || fileType.includes('video')) {
                    newScreenshots.push({
                        id: Date.now() + Math.random(),
                        type: fileType.includes('video') ? 'video' : 'image',
                        data: filePath, // Remote URL
                        url: filePath,
                        filename: filePath.split('/').pop() || 'file',
                        timestamp: new Date().toISOString(),
                        uploading: false,
                        isRemote: true
                    });
                }
            });

            // Reassign arrays to force change detection
            if (newVoiceNotes.length > 0) {
                // Since resetForm() was called, currentCase.voiceNotes is empty.
                this.currentCase.voiceNotes = newVoiceNotes;
                this.latestAudioUrl = newVoiceNotes[newVoiceNotes.length - 1].url;
            }
            if (newScreenshots.length > 0) {
                this.currentCase.screenshots = newScreenshots;
            }

            // Also populate the global uploadedFiles list for the new section
            this.currentCase.uploadedFiles = [
                ...newVoiceNotes.map(n => ({ ...n, fileType: 'audio' })),
                ...newScreenshots.map(s => ({ ...s, fileType: s.type || 'image' }))
            ];

            console.log('Final Voice Notes:', this.currentCase.voiceNotes);
            console.log('Final Screenshots:', this.currentCase.screenshots);
            console.log('Final Uploaded Files:', this.currentCase.uploadedFiles);
        }

        this.currentCase.score = payload.Percentage !== undefined ? payload.Percentage : this.currentCase.score;
        this.updateScore();
        this.loadViewer(); // Auto-load viewer if URL is present
        this.cdr.detectChanges();
        console.log('Mapping complete. Issues marked:', this.currentCase.issuesMarked);
    }

    testLoadPayload() {
        // ... (existing test payload)
        const samplePayload = {
            "SSCID": 0,
            "ModuleName": "PPTJobEntryQC",
            "ActionTypeID": 1,
            "PatientID": "TEST-123",
            "ImpressionNo": "John Doe Test",
            "affectedTeeth": "11, 21",
            "Percentage": 80,
            "Status": "Good",
            "issues": {
                "TreatmentPlan": {
                    "TreatmentPlanIncorrect": {
                        "marked": true,
                        "subIssues": ["Molar Relationship Class II/III"]
                    },
                    "ArchFormNotCoordinated": false,
                    "BoltonDiscrepancyNotAddressed": false
                },
                "ToothMovement": {
                    "ExcessTipping": true,
                    "InclinationCouldBeBetter": false
                }
            },
            "Remark": "Imported via JSON",
            "date": "2024-03-15",
            "LoginUser": "Ketan",
            "iModifyUrl": "http://example.com"
        };
        this.populateFromPayload(samplePayload);
    }

    loadApiData(impressionNo: string = "") {
        this.caseService.getCasesFromApi(impressionNo).subscribe({
            next: (response: any) => {
                console.log('=== List API Response ===');
                console.log('Full response:', response);

                let dataToPopulate = null;

                if (response && response.data) {
                    if (response.data.QCData && Array.isArray(response.data.QCData) && response.data.QCData.length > 0) {
                        dataToPopulate = response.data.QCData.find((item: any) => item.ImpressionNo === impressionNo) || response.data.QCData[0];
                        console.log('Found data in response.data.QCData');
                    }
                    else if (response.data.QCList && Array.isArray(response.data.QCList) && response.data.QCList.length > 0) {
                        dataToPopulate = response.data.QCList.find((item: any) => item.ImpressionNo === impressionNo) || response.data.QCList[0];
                        console.log('Found data in response.data.QCList');
                    }
                    else if (Array.isArray(response.data) && response.data.length > 0) {
                        dataToPopulate = response.data.find((item: any) => item.ImpressionNo === impressionNo) || response.data[0];
                        console.log('Found data in response.data (Array)');
                    }
                    else if (typeof response.data === 'object') {
                        if (response.data.ImpressionNo || response.data.FileCollection) {
                            dataToPopulate = response.data;
                            console.log('Found data in response.data (Object)');
                        }
                    }
                }
                if (!dataToPopulate) {
                    if (response.QCData && Array.isArray(response.QCData) && response.QCData.length > 0) {
                        dataToPopulate = response.QCData.find((item: any) => item.ImpressionNo === impressionNo) || response.QCData[0];
                        console.log('Found data in response.QCData');
                    }
                    else if (Array.isArray(response) && response.length > 0) {
                        dataToPopulate = response.find((item: any) => item.ImpressionNo === impressionNo) || response[0];
                        console.log('Found data in response (Array)');
                    }
                    else if (response && (response.ImpressionNo || response.FileCollection)) {
                        dataToPopulate = response;
                        console.log('Found data in response (Root Object)');
                    }
                }

                if (dataToPopulate) {
                    this.populateFromPayload(dataToPopulate);
                    console.log('Form populated from API data');
                }

                if (response && response.data && response.data.QCList && Array.isArray(response.data.QCList) && response.data.QCList.length > 0) {
                    const qcItem = response.data.QCList[0];
                    console.log('=== QCList item ===', qcItem);
                    if (qcItem.PatientID && qcItem.Patient) {
                        this.currentCase.patientName = `${qcItem.PatientID} - ${qcItem.Patient}`;
                    } else if (qcItem.PatientID) {
                        this.currentCase.patientName = qcItem.PatientID;
                    } else if (qcItem.Patient) {
                        this.currentCase.patientName = qcItem.Patient;
                    }

                    
                    if (qcItem.iModifyURL) {
                        this.currentCase.imodifyUrl = qcItem.iModifyURL;
                    }

                    this.loadViewer();
                    this.cdr.detectChanges(); 
                }
            },
            error: (err: any) => {
                console.error('List API Error', err);
            }
        });
    }

    SnapshotUrl: string | null = null;

   async capturePanelSnapshot(): Promise<string | null> {
    if (!this.currentAzureCredentials || !this.currentFolderPath) {
        const res: any = await firstValueFrom(this.caseService.getFolderPath(6));
        this.handleFolderPathResponse(res);
    }

    const element = this.snapshotTarget.nativeElement;

    const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        height: element.scrollHeight,
        windowHeight: element.scrollHeight,
        y: window.scrollY,
    });

    return new Promise((resolve) => {
        canvas.toBlob(async (blob:any) => {
            if (blob) {
                const filename = `auto-snapshot-${Date.now()}.png`;
                try {
                    // 3. Upload and return ONLY the URL
                    const url = await this.caseService.uploadToAzureBlob(
                        blob, 
                        this.currentFolderPath, 
                        this.currentAzureCredentials, 
                        filename
                    );
                    this.currentCase.SnapshotUrl = url; // Store it separately
                    resolve(url);
                } catch (err) {
                    console.error('Snapshot upload failed', err);
                    this.cdr.detectChanges();
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        }, 'image/png');
    });
}
}
