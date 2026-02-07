/**
 * Enrollment Module
 * Handles speaker voice enrollment
 */

class EnrollmentManager {
    constructor() {
        this.isEnrolling = false;
        this.enrollmentName = '';
        this.enrollmentDuration = 5; // seconds
        this.enrollmentStartTime = null;
        this.progressInterval = null;

        // DOM elements
        this.nameInput = null;
        this.startBtn = null;
        this.cancelBtn = null;
        this.progressFill = null;
        this.progressText = null;
        this.statusDiv = null;
    }

    initialize() {
        this.nameInput = document.getElementById('speakerName');
        this.startBtn = document.getElementById('startEnrollment');
        this.cancelBtn = document.getElementById('cancelEnrollment');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.statusDiv = document.getElementById('enrollmentStatus');

        this.startBtn.addEventListener('click', () => this.startEnrollment());
        this.cancelBtn.addEventListener('click', () => this.cancelEnrollment());

        // Enable start when name is entered
        this.nameInput.addEventListener('input', () => {
            this.startBtn.disabled = !this.nameInput.value.trim();
        });
    }

    async startEnrollment() {
        const name = this.nameInput.value.trim();
        if (!name) {
            this.showStatus('Please enter a name', 'error');
            return;
        }

        // Initialize audio if needed
        if (!window.audioCapture.audioContext) {
            const success = await window.audioCapture.initialize();
            if (!success) {
                this.showStatus('Failed to access microphone', 'error');
                return;
            }
        }

        await window.audioCapture.resume();

        this.isEnrolling = true;
        this.enrollmentName = name;
        this.enrollmentStartTime = Date.now();

        // Update UI
        this.startBtn.disabled = true;
        this.cancelBtn.disabled = false;
        this.nameInput.disabled = true;
        this.statusDiv.textContent = '';
        this.statusDiv.className = 'enrollment-status';

        // Tell backend to start enrollment
        window.wsClient.startEnrollment(name);

        // Start audio capture
        window.audioCapture.start((audioData) => {
            if (this.isEnrolling) {
                window.wsClient.sendAudio(audioData);
            }
        });

        // Start progress tracking
        this.startProgressTracking();
    }

    startProgressTracking() {
        this.progressInterval = setInterval(() => {
            const elapsed = (Date.now() - this.enrollmentStartTime) / 1000;
            const progress = Math.min(elapsed / this.enrollmentDuration * 100, 100);

            this.progressFill.style.width = `${progress}%`;

            const remaining = Math.max(0, this.enrollmentDuration - elapsed);
            if (remaining > 0) {
                this.progressText.textContent = `Keep speaking... ${remaining.toFixed(1)}s remaining`;
            } else {
                this.progressText.textContent = 'Processing...';
            }

            // Auto-complete when duration reached
            if (elapsed >= this.enrollmentDuration && this.isEnrolling) {
                this.completeEnrollment();
            }

        }, 100);
    }

    completeEnrollment() {
        if (!this.isEnrolling) return;

        clearInterval(this.progressInterval);
        window.audioCapture.stop();

        // Tell backend to complete enrollment
        window.wsClient.completeEnrollment(this.enrollmentName);

        this.progressText.textContent = 'Processing enrollment...';
    }

    cancelEnrollment() {
        if (!this.isEnrolling) return;

        clearInterval(this.progressInterval);
        window.audioCapture.stop();

        // Tell backend to cancel
        window.wsClient.cancelEnrollment();

        this.resetUI();
        this.showStatus('Enrollment cancelled', 'error');
    }

    handleEnrollmentComplete(message) {
        this.isEnrolling = false;
        this.resetUI();

        if (message.success) {
            this.showStatus(`Successfully enrolled "${message.name}"!`, 'success');
            this.nameInput.value = '';
            // Refresh speakers list
            window.wsClient.listSpeakers();
        } else {
            this.showStatus(message.message || 'Enrollment failed', 'error');
        }
    }

    handleEnrollmentStarted(message) {
        this.enrollmentDuration = message.duration_seconds || 5;
        this.progressText.textContent = `Speak for ${this.enrollmentDuration} seconds...`;
    }

    resetUI() {
        this.isEnrolling = false;
        this.startBtn.disabled = !this.nameInput.value.trim();
        this.cancelBtn.disabled = true;
        this.nameInput.disabled = false;
        this.progressFill.style.width = '0%';
        this.progressText.textContent = `Speak for ${this.enrollmentDuration} seconds to enroll your voice`;

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    showStatus(message, type) {
        this.statusDiv.textContent = message;
        this.statusDiv.className = `enrollment-status ${type}`;
    }
}

// Export singleton
window.enrollmentManager = new EnrollmentManager();
