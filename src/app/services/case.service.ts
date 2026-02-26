import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Case {
    id: number;
    patientName: string;
    caseId: string;
    date: string;
    score: number;
    status: 'Draft' | 'Completed' | 'In Progress';
    affectedTeeth: string;
    imodifyUrl: string;
    issuesMarked: string[];
    subIssuesMarked: { [key: string]: string[] };
    remarks: string;
    voiceNotes: any[];
    screenshots: any[];
    uploadedFiles?: any[]; // For FileCollection from API
    SnapshotUrl?: string | null; // For snapshot URL from API
}

import { HttpClient } from '@angular/common/http';
import { BlobServiceClient, newPipeline, AnonymousCredential } from '@azure/storage-blob';

@Injectable({
    providedIn: 'root'
})
export class CaseService {
    private casesSubject = new BehaviorSubject<Case[]>([]);
    cases$ = this.casesSubject.asObservable();

    private readonly STORAGE_KEY = 'inkd_qc_cases';
    // private readonly API_URL = 'https://uat.illusiondentallab.com/API_2020/api/Common/Save';

    // Issues Data Structure
    readonly issuesData: any = {
        // ... (existing data) ...
        treatment_plan: {
            category_name: "Treatment Plan",
            issues: [
                {
                    id: "plan_incorrect",
                    label: "Treatment Plan Incorrect",
                    deduction: 20,
                    sub_issues: [
                        "Consider Single Arch Extraction",
                        "Should have considered alternate scenarios",
                        "Molar Relationship Class II/III"
                    ]
                },
                { id: "arch_not_coord", label: "Arch Form Not Coordinated", deduction: 10 },
                { id: "bolton_discrepancy", label: "Bolton Discrepancy Not Addressed", deduction: 8 }
            ]
        },
        tooth_movement: {
            category_name: "Tooth Movement",
            issues: [
                { id: "excess_tipping", label: "Excess Tipping", deduction: 5 },
                { id: "inclination_poor", label: "Inclination Could Be Better", deduction: 5 },
                { id: "rotation_issues", label: "Angulation/Rotation Corrections Needed", deduction: 5 },
                { id: "midlines_not_matched", label: "Midlines Not Matched", deduction: 10 },
                { id: "intrusion_needed", label: "Intrusion Movement Needed", deduction: 5 },
                { id: "extrusion_needed", label: "Extrusion Movement Needed", deduction: 5 }
            ]
        },
        staging: {
            category_name: "Staging & Biomechanics",
            issues: [
                { id: "round_tripping", label: "Unnecessary Round Tripping", deduction: 5 },
                { id: "staging_issues", label: "Staging Issues", deduction: 5 },
                { id: "collision_observed", label: "Collision Observed", deduction: 15, description: "Teeth passing through each other in simulation" },
                { id: "velocity_high", label: "Movement Velocity Too High", deduction: 8 },
                { id: "overcorrection", label: "Overcorrection Needed", deduction: 3 }
            ]
        },
        occlusion: {
            category_name: "Occlusion",
            issues: [
                { id: "excess_overjet", label: "Excess Overjet", deduction: 10 },
                { id: "overbite_poor", label: "Overbite Improvement Needed", deduction: 10 },
                { id: "intercuspation_poor", label: "Intercuspation Improvement Needed", deduction: 10 },
                { id: "occlusal_cant", label: "Occlusal Cant Present", deduction: 8 },
                { id: "crossbite", label: "Crossbite Not Fully Corrected", deduction: 10 }
            ]
        },
        ipr_attachments: {
            category_name: "IPR & Attachments",
            issues: [
                {
                    id: "ipr_distribution",
                    label: "IPR Distribution Issue",
                    deduction: 5,
                    sub_issues: [
                        "Distribute in Canine/Premolar Region",
                        "Avoid Premolar-only IPR",
                        "Excessive IPR Amount",
                        "Insufficient IPR for Crowding"
                    ]
                },
                {
                    id: "attachment_issue",
                    label: "Attachment Placement Issue",
                    deduction: 5,
                    sub_issues: [
                        "Extrusion Attachment Required",
                        "Rotation Attachment Needed",
                        "Remove Unnecessary Attachment",
                        "Root Control Attachment Needed"
                    ]
                }
            ]
        },
        doctor_instructions: {
            category_name: "Doctor Instructions",
            issues: [
                { id: "instructions_not_followed", label: "Instructions Not Followed", deduction: 25 },
                { id: "instructions_partial", label: "Instructions Partially Followed", deduction: 10 }
            ]
        }
    };

    readonly suggestionsMap: any = {
        plan_incorrect: "Address treatment plan issues and provide alternative scenarios where applicable",
        arch_not_coord: "Review and coordinate upper/lower arch forms for improved symmetry",
        bolton_discrepancy: "Assess Bolton ratio and plan appropriate space management",
        excess_tipping: "Reduce tipping by adjusting attachment placement or staging",
        inclination_poor: "Improve inclination with proper attachment selection and orientation",
        midlines_not_matched: "Implement asymmetric movement strategy for midline correction",
        collision_observed: "Verify tooth trajectory in simulation and adjust staging to avoid collisions",
        excess_overjet: "Increase overjet reduction magnitude or extend treatment timeline",
        overbite_poor: "Implement bite ramp or bite opening strategy for deep bite management",
        intercuspation_poor: "Verify intercuspation in final aligner stage; consider refinement if needed",
        ipr_distribution: "Relocate IPR distribution to canine-premolar region for optimal spacing",
        attachment_issue: "Verify attachment type and placement match tooth movement requirements",
        instructions_not_followed: "Review doctor's notes and ensure 100% compliance with treatment directives",
        instructions_partial: "Address partially followed instructions; clarify with doctor if needed"
    };


    constructor(private http: HttpClient) {
        this.loadCases();
    }

    private loadCases() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (data) {
            try {
                this.casesSubject.next(JSON.parse(data));
            } catch (e) {
                console.error('Failed to parse cases', e);
            }
        }
    }

    saveCase(caseData: Case) {
        const currentCases = this.casesSubject.value;
        const index = currentCases.findIndex(c => c.id === caseData.id);

        if (index > -1) {
            currentCases[index] = caseData;
        } else {
            currentCases.push(caseData);
        }

        this.updateStorage(currentCases);
    }

    saveCaseToApi(payload: any) {
        const formData = new FormData();
        formData.append('SaveJson', JSON.stringify(payload));
        return this.http.post('https://uat.illusiondentallab.com/API_2020/api/Common/Save', formData);
    }

    getFolderPath(folderId: number) {
        const payload = { FolderID: folderId };
        return this.http.post('https://uat.illusiondentallab.com/API_2020/api/Common/Get_FolderPath', payload);
    }

    async uploadToAzureBlob(blob: Blob, folderPath: string, azuredata: any, customFileName: string = ''): Promise<string> {
        console.log('Azure Uploading Blob. Credential Object:', azuredata);
        if (!azuredata) {
            throw new Error('Azure credentials not provided');
        }

        // ... (existing findKey helper) ...
        const findKey = (obj: any, search: string) => {
            if (!obj || typeof obj !== 'object') return null;
            const keys = Object.keys(obj);
            const exact = keys.find(k => k.toLowerCase() === search.toLowerCase());
            if (exact) return obj[exact];
            const contains = keys.find(k => k.toLowerCase().includes(search.toLowerCase()));
            if (contains) return obj[contains];
            return null;
        };

        const accountName = findKey(azuredata, 'accountname');
        const sasToken = findKey(azuredata, 'sastoken') || findKey(azuredata, 'sas');
        const containerName = findKey(azuredata, 'containername');
        const azureurl = findKey(azuredata, 'azurepath') || findKey(azuredata, 'azureurl');

        if (!accountName || !sasToken || !containerName) {
            console.error('Missing specific Azure field in:', azuredata);
            throw new Error(`Incomplete Azure credentials. Missing: ${!accountName ? 'AccountName ' : ''}${!sasToken ? 'SASToken ' : ''}${!containerName ? 'ContainerName' : ''}`);
        }

        const azurepath = containerName + (folderPath || '');
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        let fileName = customFileName;
        if (!fileName) {
            const extension = blob.type.split('/')[1] || 'bin';
            const prefix = blob.type.startsWith('audio') ? 'VM' : blob.type.startsWith('video') ? 'REC' : 'IMG';
            fileName = `${prefix}_${timestamp}.${extension}`;
        }

        const pipeline = newPipeline(new AnonymousCredential(), {
            retryOptions: { maxTries: 4 },
            keepAliveOptions: { enable: false }
        });

        const blobServiceClient = new BlobServiceClient(
            `https://${accountName}.blob.core.windows.net?${sasToken}`,
            pipeline
        );

        const containerClient = blobServiceClient.getContainerClient(azurepath);
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);

        await blockBlobClient.uploadBrowserData(blob, {
            blockSize: 4 * 1024 * 1024,
            concurrency: 20,
            blobHTTPHeaders: { blobContentType: blob.type }
        });

        const baseUrl = azureurl.endsWith('/') ? azureurl : `${azureurl}/`;
        return `${baseUrl}${azurepath}/${fileName}?${sasToken}`;
    }

    uploadFile(file: Blob, fileName: string, folderPath: string = '') {
        const formData = new FormData();
        formData.append('file', file, fileName);
        if (folderPath) {
            formData.append('FolderPath', folderPath);
        }
        return this.http.post('https://uat.illusiondentallab.com/API_2020/api/Common/UploadFiles', formData);
    }

    getCasesFromApi(impressionNo: string = "") {
        // Payload for listing/getting data
        const payload = {
            "SSCID": 0,
            "ModuleName": "PPTJobEntryQC",
            "ActionTypeID": 2,
            "ImpressionNo": impressionNo,
            "SituationID": 0
        };
        const formData = new FormData();
        formData.append('ListJson', JSON.stringify(payload));

        return this.http.post('https://uat.illusiondentallab.com/API_2020/api/Common/List', formData);
    }

    deleteCase(id: number) {
        const currentCases = this.casesSubject.value.filter(c => c.id !== id);
        this.updateStorage(currentCases);
    }

    calculateScore(issuesMarked: string[]): number {
        let totalDeduction = 0;
        issuesMarked.forEach(issueId => {
            for (const category in this.issuesData) {
                const issue = this.issuesData[category].issues.find((i: any) => i.id === issueId);
                if (issue) {
                    totalDeduction += issue.deduction;
                    break;
                }
            }
        });
        return Math.max(0, 100 - totalDeduction);
    }

    private updateStorage(cases: Case[]) {
        this.casesSubject.next(cases);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cases));
    }

    importCases(newCases: Case[], merge: boolean = true) {
        if (merge) {
            const currentCases = this.casesSubject.value;
            newCases.forEach(nc => {
                const exists = currentCases.findIndex(c => c.caseId === nc.caseId);
                if (exists === -1) {
                    currentCases.push({ ...nc, id: Date.now() + Math.random() });
                }
                // If exists, you might want to update or skip. For now, we skip duplicates by ID.
                // Or detailed merge logic as in original HTML.
            });
            this.updateStorage(currentCases);
        } else {
            this.updateStorage(newCases);
        }
    }
}
