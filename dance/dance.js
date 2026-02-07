/**
 * Dance Manager Module
 * Handles dance recording, choreography, and stick figure animation
 */

class DanceManager {
    constructor(wsClient) {
        this.wsClient = wsClient;
        this.isRecording = false;
        this.recordingStartTime = null;
        this.recordingDuration = 30; // seconds
        this.timerInterval = null;
        
        this.dancePlan = null;
        this.danceStartTime = null;
        this.animationFrame = null;
        
        // Loading state
        this.isLoading = false;
        this.loadingStage = '';
        this.loadingStartTime = null;
        this.loadingDots = 0;
        this.loadingInterval = null;
        
        // Particle system for visual effects
        this.particles = [];
        
        // Debug logging
        console.log('[Dance] DanceManager initialized');
        
        // AI Narrator
        this.narrator = this.initializeNarrator();
        this.narratorEnabled = true;
        
        this.initializeUI();
        this.setupWebSocketHandlers();
    }
    
    initializeUI() {
        console.log('[Dance] initializeUI() called');
        this.startBtn = document.getElementById('startDance');
        this.stopBtn = document.getElementById('stopDance');
        this.cancelBtn = document.getElementById('cancelDance');
        this.statusText = document.querySelector('.status-text');
        this.timerDisplay = document.getElementById('danceTimer');
        this.progressBar = document.getElementById('danceProgress');
        this.canvas = document.getElementById('danceCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.transcriptDiv = document.getElementById('danceTranscript');
        this.scoreDiv = document.getElementById('danceScore');
        
        console.log('[Dance] UI elements:', {
            startBtn: !!this.startBtn,
            stopBtn: !!this.stopBtn,
            cancelBtn: !!this.cancelBtn,
            canvas: !!this.canvas,
            statusText: !!this.statusText
        });
        
        if (this.startBtn) {
            console.log('[Dance] Attaching click handler to startBtn');
            this.startBtn.addEventListener('click', () => {
                console.log('[Dance] *** START BUTTON CLICKED ***');
                this.startRecording();
            });
        } else {
            console.error('[Dance] startBtn not found!');
        }
        
        if (this.stopBtn) {
            console.log('[Dance] Attaching click handler to stopBtn');
            this.stopBtn.addEventListener('click', () => {
                console.log('[Dance] *** STOP BUTTON CLICKED ***');
                this.finishRecording();
            });
        } else {
            console.error('[Dance] stopBtn not found!');
        }
        
        if (this.cancelBtn) {
            console.log('[Dance] Attaching click handler to cancelBtn');
            this.cancelBtn.addEventListener('click', () => {
                console.log('[Dance] *** CANCEL BUTTON CLICKED ***');
                this.cancelRecording();
            });
        } else {
            console.error('[Dance] cancelBtn not found!');
        }
    }
    
    setupWebSocketHandlers() {
        // Store original onMessage handler
        const originalOnMessage = this.wsClient.onMessage;
        
        // Wrap with dance message handling
        this.wsClient.onMessage = (msg) => {
            // Call original handler first
            if (originalOnMessage) originalOnMessage(msg);
            
            // Handle dance messages
            this.handleDanceMessage(msg);
        };
    }
    
    initializeNarrator() {
        if ('speechSynthesis' in window) {
            const synth = window.speechSynthesis;
            // Load voices
            let voice = null;
            const loadVoice = () => {
                const voices = synth.getVoices();
                voice = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha')) || voices[0];
            };
            
            if (synth.getVoices().length > 0) {
                loadVoice();
            } else {
                synth.onvoiceschanged = loadVoice;
            }
            
            return {
                synth,
                voice,
                speak: (text) => {
                    if (!this.narratorEnabled) return;
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.voice = voice;
                    utterance.rate = 1.1;
                    utterance.pitch = 1.2;
                    synth.speak(utterance);
                }
            };
        }
        return null;
    }
    
    async startRecording() {
        console.log('[Dance] ============ startRecording() ENTRY ============');
        console.log('[Dance] WebSocket state:', this.wsClient?.socket?.readyState);
        console.log('[Dance] WebSocket OPEN constant:', WebSocket.OPEN);
        
        if (!this.wsClient) {
            console.error('[Dance] ERROR: wsClient is null/undefined');
            alert('WebSocket client not initialized');
            return;
        }
        
        if (!this.wsClient.socket) {
            console.error('[Dance] ERROR: WebSocket socket is null/undefined');
            alert('WebSocket not connected. Trying to connect...');
            this.wsClient.connect();
            return;
        }
        
        console.log('[Dance] WebSocket readyState:', this.wsClient.socket.readyState);
        console.log('[Dance] Is connected?', this.wsClient.socket.readyState === WebSocket.OPEN);
        
        if (this.wsClient.socket.readyState !== WebSocket.OPEN) {
            console.error('[Dance] WebSocket not connected (state:', this.wsClient.socket.readyState, ')');
            alert('Not connected to server. Please wait for connection...');
            return;
        }
        
        console.log('[Dance] ✓ WebSocket is connected');
        
        // Initialize audio capture if needed
        console.log('[Dance] Checking audio capture...');
        console.log('[Dance] window.audioCapture:', !!window.audioCapture);
        console.log('[Dance] audioCapture.audioContext:', !!window.audioCapture?.audioContext);
        
        if (!window.audioCapture) {
            console.error('[Dance] ERROR: window.audioCapture not found!');
            alert('Audio capture not initialized');
            return;
        }
        
        if (!window.audioCapture.audioContext) {
            console.log('[Dance] Initializing audio capture...');
            try {
                const success = await window.audioCapture.initialize();
                console.log('[Dance] Audio capture initialize result:', success);
                if (!success) {
                    console.error('[Dance] Failed to initialize audio capture');
                    alert('Failed to access microphone. Please check permissions.');
                    return;
                }
            } catch (err) {
                console.error('[Dance] Audio capture initialization error:', err);
                alert('Microphone error: ' + err.message);
                return;
            }
        }
        
        // Resume audio context if suspended
        console.log('[Dance] Resuming audio context...');
        await window.audioCapture.resume();
        console.log('[Dance] Audio context state:', window.audioCapture.audioContext?.state);
        
        console.log('[Dance] Starting recording session');
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.cancelBtn.disabled = false;
        this.scoreDiv.style.display = 'none';
        this.transcriptDiv.textContent = '';
        
        // Clear canvas
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // Start audio capture and send to WebSocket
        console.log('[Dance] Starting audio capture with callback...');
        window.audioCapture.start((audioData) => {
            console.log('[Dance] Audio data received, length:', audioData.byteLength);
            if (this.wsClient.socket && this.wsClient.socket.readyState === WebSocket.OPEN) {
                this.wsClient.socket.send(audioData);
            } else {
                console.warn('[Dance] Cannot send audio - WebSocket not open');
            }
        });
        console.log('[Dance] Audio capture started, isCapturing:', window.audioCapture.isCapturing);
        
        // Send start message
        console.log('[Dance] Sending start_dance message to server');
        this.wsClient.socket.send(JSON.stringify({
            type: 'start_dance'
        }));
        
        this.updateStatus('🎤 Describe your dance... Click "Done" when finished!');
        this.startTimer();
        console.log('[Dance] ============ startRecording() COMPLETE ============');
    }
    
    cancelRecording() {
        if (!this.isRecording) return;
        
        console.log('[Dance] cancelRecording() called');
        this.wsClient.socket.send(JSON.stringify({
            type: 'cancel_dance'
        }));
        
        this.stopRecording();
        this.stopLoadingSequence();
        this.updateStatus('Cancelled. Ready to record.');
        console.log('[Dance] Recording cancelled');
    }
    
    resetForNewDance() {
        console.log('[Dance] Resetting for new dance...');
        
        // Clear dance plan and canvas
        this.dancePlan = null;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // Reset buttons to initial state
        this.startBtn.textContent = '🎤 Create Dance (up to 30s)';
        this.startBtn.disabled = false;
        this.startBtn.onclick = () => {
            console.log('[Dance] *** START BUTTON CLICKED ***');
            this.startRecording();
        };
        
        this.stopBtn.textContent = '⏹️ Done Recording';
        this.stopBtn.disabled = true;
        this.stopBtn.onclick = () => {
            console.log('[Dance] *** STOP BUTTON CLICKED ***');
            this.finishRecording();
        };
        
        this.cancelBtn.disabled = true;
        
        // Clear transcript and score
        this.transcriptDiv.textContent = '';
        this.scoreDiv.style.display = 'none';
        
        this.updateStatus('Ready to record a new dance');
        console.log('[Dance] Reset complete');
    }
    
    finishRecording() {
        if (!this.isRecording) return;
        
        const elapsed = (Date.now() - this.recordingStartTime) / 1000;
        console.log(`[Dance] finishRecording() called - elapsed: ${elapsed.toFixed(2)}s`);
        
        // Require at least 3 seconds of recording
        if (elapsed < 3) {
            console.warn('[Dance] Recording too short, minimum 3 seconds required');
            alert('Please record at least 3 seconds of description!');
            return;
        }
        
        // Send finish message to process immediately
        console.log('[Dance] Sending finish_dance message to server');
        this.wsClient.socket.send(JSON.stringify({
            type: 'finish_dance'
        }));
        
        this.stopRecording();
        this.startLoadingSequence('transcribing');
    }
    
    stopRecording() {
        this.isRecording = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.cancelBtn.disabled = true;
        
        // Stop audio capture
        if (window.audioCapture) {
            console.log('[Dance] Stopping audio capture');
            window.audioCapture.stop();
        }
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        this.timerDisplay.textContent = '';
        this.progressBar.style.width = '0%';
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = (Date.now() - this.recordingStartTime) / 1000;
            const remaining = Math.max(0, this.recordingDuration - elapsed);
            
            this.timerDisplay.textContent = `${remaining.toFixed(1)}s`;
            this.progressBar.style.width = `${(elapsed / this.recordingDuration) * 100}%`;
            
            if (remaining <= 0) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }, 100);
    }
    
    updateStatus(message) {
        if (this.statusText) {
            // Check if message should have a spinner
            if (message.includes('Processing') || message.includes('Transcribing') || 
                message.includes('generating') || message.includes('Preparing')) {
                this.statusText.innerHTML = `<span class="loading-spinner"></span>${message}`;
            } else {
                this.statusText.textContent = message;
            }
        }
    }
    
    startLoadingSequence(stage) {
        console.log(`[Dance] Starting loading sequence - stage: ${stage}`);
        
        // Stop any existing loading sequence first
        if (this.loadingInterval) {
            console.log('[Dance] Clearing previous loading interval');
            clearInterval(this.loadingInterval);
            this.loadingInterval = null;
        }
        
        this.isLoading = true;
        this.loadingStage = stage;
        this.loadingStartTime = Date.now();
        this.loadingDots = 0;
        
        // Start loading animation
        this.loadingInterval = setInterval(() => {
            // Double-check we should still be loading
            if (!this.isLoading) {
                console.log('[Dance] Loading flag is false, stopping interval');
                clearInterval(this.loadingInterval);
                this.loadingInterval = null;
                return;
            }
            
            this.loadingDots = (this.loadingDots + 1) % 4;
            const dots = '.'.repeat(this.loadingDots);
            const elapsed = ((Date.now() - this.loadingStartTime) / 1000).toFixed(1);
            
            let message = '';
            switch (this.loadingStage) {
                case 'transcribing':
                    message = `🎙️ Transcribing your description${dots} (${elapsed}s)`;
                    break;
                case 'generating':
                    message = `🤖 AI generating choreography${dots} (${elapsed}s)`;
                    break;
                case 'preparing':
                    message = `✨ Preparing your dance${dots} (${elapsed}s)`;
                    break;
                default:
                    message = `⏳ Processing${dots} (${elapsed}s)`;
            }
            
            this.updateStatus(message);
        }, 300);
    }
    
    stopLoadingSequence() {
        if (this.loadingInterval) {
            console.log('[Dance] Clearing loading interval');
            clearInterval(this.loadingInterval);
            this.loadingInterval = null;
        }
        this.isLoading = false;
        this.loadingStage = '';
        this.loadingStartTime = null;
        console.log('[Dance] Loading sequence stopped');
    }
    
    handleDanceMessage(msg) {
        console.log('[Dance] Received message:', msg.type);
        
        switch (msg.type) {
            case 'dance_recording_started':
                console.log('[Dance] ✓ Recording started on server');
                break;
                
            case 'dance_recording_progress':
                console.log(`[Dance] Recording progress: ${msg.elapsed.toFixed(1)}s / ${this.recordingDuration}s`);
                break;
                
            case 'dance_status':
                console.log(`[Dance] Status update: ${msg.message}`);
                
                // Update loading stage based on status message
                if (msg.message.includes('Transcribing')) {
                    this.startLoadingSequence('transcribing');
                } else if (msg.message.includes('Generating') || msg.message.includes('AI')) {
                    this.startLoadingSequence('generating');
                } else if (msg.message.includes('Processing')) {
                    this.startLoadingSequence('preparing');
                } else {
                    this.updateStatus(msg.message);
                }
                break;
                
            case 'dance_plan':
                const processingTime = this.loadingStartTime ? 
                    ((Date.now() - this.loadingStartTime) / 1000).toFixed(2) : 'N/A';
                console.log(`[Dance] ✓ Dance plan received (total processing: ${processingTime}s)`);
                console.log('[Dance] Plan details:', {
                    keyframes: msg.plan.keyframes.length,
                    duration: msg.plan.duration,
                    transcript: msg.transcript
                });
                
                this.stopRecording();
                this.stopLoadingSequence();
                this.receiveDancePlan(msg.plan, msg.transcript);
                break;
                
            case 'dance_error':
                console.error('[Dance] ✗ Error received:', msg.message);
                this.stopRecording();
                this.stopLoadingSequence();
                this.updateStatus(`❌ Error: ${msg.message}`);
                alert(msg.message);
                break;
                
            case 'dance_cancelled':
                console.log('[Dance] ✓ Recording cancelled on server');
                this.stopRecording();
                this.stopLoadingSequence();
                break;
        }
    }
    
    receiveDancePlan(plan, transcript) {
        console.log('[Dance] === DANCE PLAN RECEIVED ===');
        console.log('[Dance] Transcript:', transcript);
        console.log('[Dance] Duration:', plan.duration, 'seconds');
        console.log('[Dance] Keyframes:', plan.keyframes.length);
        
        // Log AI reasoning if provided
        if (plan.reasoning) {
            console.log('[Dance] 💭 AI Choreographer\'s Thinking:');
            console.log('[Dance]   ', plan.reasoning);
        }
        
        plan.keyframes.forEach((kf, i) => {
            console.log(`[Dance]   ${i + 1}. ${kf.time.toFixed(1)}s - ${kf.pose}`);
        });
        
        // Stop audio capture since we have the dance plan
        this.stopRecording();
        
        this.dancePlan = plan;
        this.transcriptDiv.textContent = `"${transcript}"`;
        
        // Show play button instead of auto-starting
        this.updateStatus('✅ Dance ready! Click "Play Dance" to watch');
        this.startBtn.textContent = '▶️ Play Dance';
        this.startBtn.disabled = false;
        this.startBtn.onclick = () => this.playDance();
        
        console.log('[Dance] Dance ready to play');
    }
    
    playDance() {
        if (!this.dancePlan) {
            console.error('[Dance] No dance plan available');
            return;
        }
        
        console.log('[Dance] Starting dance animation...');
        this.updateStatus('🎭 Dancing!');
        this.startBtn.disabled = true;
        this.scoreDiv.style.display = 'none';
        
        // Show dance timer
        this.timerDisplay.style.display = 'block';
        this.timerDisplay.textContent = `0.0s / ${this.dancePlan.duration.toFixed(1)}s`;
        this.progressBar.style.width = '0%';
        
        // Reset keyframe narration flags
        this.dancePlan.keyframes.forEach(kf => kf.narrated = false);
        
        // Narrator announcement
        if (this.narrator) {
            this.narrator.speak('Let\'s dance!');
        }
        
        // Start animation
        this.danceStartTime = performance.now() / 1000;
        this.animateDance();
    }
    
    animateDance() {
        if (!this.dancePlan || !this.ctx) return;
        
        const currentTime = (performance.now() / 1000) - this.danceStartTime;
        
        if (currentTime > this.dancePlan.duration) {
            // Dance complete
            console.log('[Dance] ✓ Animation complete');
            
            // Hide timer and progress bar completely
            this.timerDisplay.textContent = '';
            this.timerDisplay.style.display = 'none';
            this.progressBar.style.width = '0%';
            
            this.updateStatus('✨ Dance complete! Click "Replay" to watch again or "New Dance" to create another');
            if (this.narrator) {
                this.narrator.speak('Fantastic performance!');
            }
            this.showScore();
            
            // Show replay and new dance buttons
            this.startBtn.textContent = '🔄 Replay Dance';
            this.startBtn.disabled = false;
            this.startBtn.onclick = () => this.playDance();
            
            this.stopBtn.textContent = '🎤 New Dance';
            this.stopBtn.disabled = false;
            this.stopBtn.onclick = () => this.resetForNewDance();
            
            return;
        }
        
        // Update timer and progress during animation
        this.timerDisplay.textContent = `${currentTime.toFixed(1)}s / ${this.dancePlan.duration.toFixed(1)}s`;
        this.progressBar.style.width = `${(currentTime / this.dancePlan.duration) * 100}%`;
        
        // Add narrator commentary at keyframes
        if (this.narrator && currentTime > 0) {
            const currentKeyframe = this.getCurrentKeyframe(currentTime);
            if (currentKeyframe && !currentKeyframe.narrated) {
                currentKeyframe.narrated = true;
                const comments = [
                    'Nice move!', 'Looking good!', 'Keep it up!',
                    'Smooth!', 'Excellent!', 'Beautiful!'
                ];
                if (Math.random() < 0.3) {  // 30% chance at each keyframe
                    const comment = comments[Math.floor(Math.random() * comments.length)];
                    this.narrator.speak(comment);
                }
            }
        }
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update and draw particles
        this.updateParticles();
        this.drawParticles();
        
        // Get current pose
        const pose = this.getPoseAtTime(currentTime);
        
        // Draw stick figure
        this.drawStickFigure(pose);
        
        // Continue animation
        this.animationFrame = requestAnimationFrame(() => this.animateDance());
    }
    
    getPoseAtTime(time) {
        const keyframes = this.dancePlan.keyframes;
        
        // Find surrounding keyframes
        let prevFrame = keyframes[0];
        let nextFrame = keyframes[keyframes.length - 1];
        
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
                prevFrame = keyframes[i];
                nextFrame = keyframes[i + 1];
                break;
            }
        }
        
        // Interpolate between poses
        if (prevFrame === nextFrame) {
            return this.getPoseAngles(prevFrame.pose);
        }
        
        const frameDuration = nextFrame.time - prevFrame.time;
        const t = (time - prevFrame.time) / frameDuration;
        
        // Use per-keyframe easing (from nextFrame, as it defines transition to that frame)
        const easingType = nextFrame.easing || 'cubic';
        const easedT = this.applyEasing(t, easingType);
        
        const prevAngles = this.getPoseAngles(prevFrame.pose);
        const nextAngles = this.getPoseAngles(nextFrame.pose);
        
        return this.interpolatePoses(prevAngles, nextAngles, easedT);
    }
    
    getCurrentKeyframe(time) {
        const keyframes = this.dancePlan.keyframes;
        for (let i = 0; i < keyframes.length; i++) {
            if (Math.abs(keyframes[i].time - time) < 0.1) {
                return keyframes[i];
            }
        }
        return null;
    }
    
    updateParticles() {
        // Update existing particles
        this.particles = this.particles.filter(p => {
            p.y += p.vy;
            p.x += p.vx;
            p.alpha -= 0.02;
            return p.alpha > 0;
        });
        
        // Add new particles randomly
        if (Math.random() < 0.15) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: this.canvas.height,
                vx: (Math.random() - 0.5) * 2,
                vy: -2 - Math.random() * 3,
                alpha: 1.0,
                size: 2 + Math.random() * 3,
                color: ['#4CAF50', '#8BC34A', '#66BB6A'][Math.floor(Math.random() * 3)]
            });
        }
    }
    
    drawParticles() {
        this.ctx.save();
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.restore();
    }
    
    getPoseAngles(poseNameOrAngles) {
        // If pose is already an object with angles, return it with defaults
        if (typeof poseNameOrAngles === 'object') {
            return {
                waist: 0, body: 0,
                lShoulder: 0, lElbow: 0, rShoulder: 0, rElbow: 0,
                lHip: 0, lKnee: 0, rHip: 0, rKnee: 0,
                rotation: 0, jumpOffset: 0,
                ...poseNameOrAngles
            };
        }
        
        const POSE_LIBRARY = {
            IDLE: { 
                waist: 0, body: 0,
                lShoulder: 10, lElbow: 0, rShoulder: -10, rElbow: 0,
                lHip: 0, lKnee: 0, rHip: 0, rKnee: 0
            },
            ARMS_UP: { 
                waist: 5, body: -5,
                lShoulder: 90, lElbow: 0, rShoulder: 90, rElbow: 0,
                lHip: 10, lKnee: -15, rHip: 10, rKnee: -15
            },
            ARMS_WAVE_LEFT: { 
                waist: -10, body: 5,
                lShoulder: 90, lElbow: -30, rShoulder: -20, rElbow: 0,
                lHip: 15, lKnee: -20, rHip: 25, rKnee: -10
            },
            ARMS_WAVE_RIGHT: { 
                waist: 10, body: 5,
                lShoulder: -20, lElbow: 0, rShoulder: 90, rElbow: -30,
                lHip: 25, lKnee: -10, rHip: 15, rKnee: -20
            },
            SPIN_LEFT: { 
                waist: 0, body: 0,
                lShoulder: 45, lElbow: -20, rShoulder: 45, rElbow: -20,
                lHip: 20, lKnee: -30, rHip: 15, rKnee: -25
            },
            SPIN_RIGHT: { 
                waist: 0, body: 0,
                lShoulder: 45, lElbow: -20, rShoulder: 45, rElbow: -20,
                lHip: 15, lKnee: -25, rHip: 20, rKnee: -30
            },
            KICK_LEFT: { 
                waist: 10, body: -10,
                lShoulder: -30, lElbow: 10, rShoulder: -30, rElbow: 10,
                lHip: 90, lKnee: -20, rHip: 0, rKnee: 0
            },
            KICK_RIGHT: { 
                waist: 10, body: -10,
                lShoulder: -30, lElbow: 10, rShoulder: -30, rElbow: 10,
                lHip: 0, lKnee: 0, rHip: 90, rKnee: -20
            },
            JUMP: { 
                waist: 10, body: -15,
                lShoulder: -20, lElbow: 20, rShoulder: -20, rElbow: 20,
                lHip: 60, lKnee: -100, rHip: 60, rKnee: -100,
                jumpOffset: -40,
                torsoScaleY: 0.9
            },
            BOW: { 
                waist: -45, body: -30,
                lShoulder: -20, lElbow: 0, rShoulder: -20, rElbow: 0,
                lHip: 15, lKnee: -20, rHip: 15, rKnee: -20
            },
            FLOSS_LEFT: {
                waist: 30, body: 0,
                lShoulder: 90, lElbow: 0, rShoulder: -90, rElbow: 0,
                lHip: 20, lKnee: -15, rHip: 10, rKnee: -10
            },
            FLOSS_RIGHT: {
                waist: -30, body: 0,
                lShoulder: -90, lElbow: 0, rShoulder: 90, rElbow: 0,
                lHip: 10, lKnee: -10, rHip: 20, rKnee: -15
            },
            DAB: {
                waist: 0, body: 10,
                lShoulder: 45, lElbow: -90, rShoulder: -45, rElbow: 0,
                lHip: 5, lKnee: -10, rHip: 5, rKnee: -10
            },
            TUBE_WAVE: {
                waist: 0, body: -15,
                lShoulder: 45, lElbow: -30, rShoulder: -45, rElbow: 30,
                lHip: 10, lKnee: -15, rHip: 10, rKnee: -15
            },
            HIGH_KNEE_LEFT: {
                waist: 5, body: -5,
                lShoulder: -45, lElbow: -45, rShoulder: 45, rElbow: 45,
                lHip: 90, lKnee: -10, rHip: 0, rKnee: -15
            },
            HIGH_KNEE_RIGHT: {
                waist: 5, body: -5,
                lShoulder: 45, lElbow: 45, rShoulder: -45, rElbow: -45,
                lHip: 0, lKnee: -15, rHip: 90, rKnee: -10
            }
        };
        
        return POSE_LIBRARY[poseNameOrAngles] || POSE_LIBRARY.IDLE;
    }
    
    interpolatePoses(pose1, pose2, t) {
        const lerp = (a, b, t) => a + (b - a) * t;
        
        return {
            waist: lerp(pose1.waist || 0, pose2.waist || 0, t),
            body: lerp(pose1.body || 0, pose2.body || 0, t),
            lShoulder: lerp(pose1.lShoulder || 0, pose2.lShoulder || 0, t),
            lElbow: lerp(pose1.lElbow || 0, pose2.lElbow || 0, t),
            rShoulder: lerp(pose1.rShoulder || 0, pose2.rShoulder || 0, t),
            rElbow: lerp(pose1.rElbow || 0, pose2.rElbow || 0, t),
            lHip: lerp(pose1.lHip || 0, pose2.lHip || 0, t),
            lKnee: lerp(pose1.lKnee || 0, pose2.lKnee || 0, t),
            rHip: lerp(pose1.rHip || 0, pose2.rHip || 0, t),
            rKnee: lerp(pose1.rKnee || 0, pose2.rKnee || 0, t),
            jumpOffset: lerp(pose1.jumpOffset || 0, pose2.jumpOffset || 0, t),
            torsoScaleY: lerp(pose1.torsoScaleY || 1.0, pose2.torsoScaleY || 1.0, t),
            footTargetY: lerp(pose1.footTargetY || 0, pose2.footTargetY || 0, t)
        };
    }
    
    applyEasing(t, easingType) {
        switch(easingType) {
            case 'linear':
                return t;
            case 'bounce':
                // Quad bounce: simulate impact
                return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
            case 'cubic':
            default:
                // Cubic in-out (existing)
                return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }
    }
    
    drawStickFigure(pose) {
        const ctx = this.ctx;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height * 0.7 + (pose.jumpOffset || 0);  // Lower position (70% down from top)
        
        const headRadius = 30;
        const upperBodyLength = 50 * (pose.torsoScaleY || 1.0);  // Apply squash/stretch
        const lowerBodyLength = 50 * (pose.torsoScaleY || 1.0);  // Apply squash/stretch
        const upperArmLength = 35;
        const forearmLength = 35;
        const thighLength = 45;
        const shinLength = 45;
        
        // Apply simple IK if footTargetY is provided
        let adjustedPose = {...pose};
        if (pose.footTargetY !== undefined && pose.footTargetY !== 0) {
            const targetDist = Math.abs(pose.footTargetY);
            const hipLength = thighLength + shinLength;
            const kneeAdjust = Math.atan2(targetDist, hipLength) * (180 / Math.PI);
            adjustedPose.lKnee = Math.max(-150, (pose.lKnee || 0) - kneeAdjust);
            adjustedPose.rKnee = Math.max(-150, (pose.rKnee || 0) - kneeAdjust);
        }
        
        ctx.save();
        ctx.translate(centerX, centerY);
        // NO rotation applied - removed for stability
        
        // Draw style with glow
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#4CAF50';
        ctx.fillStyle = '#4CAF50';
        ctx.shadowColor = '#4CAF50';
        ctx.shadowBlur = 20;
        
        // Waist (lower body base)
        const waistRad = adjustedPose.waist * Math.PI / 180;
        const waistX = lowerBodyLength * Math.sin(waistRad);
        const waistY = -lowerBodyLength * Math.cos(waistRad);
        
        // Lower body
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(waistX, waistY);
        ctx.stroke();
        
        // Upper body from waist
        const bodyRad = (adjustedPose.body + adjustedPose.waist) * Math.PI / 180;
        const shoulderX = waistX + upperBodyLength * Math.sin(bodyRad);
        const shoulderY = waistY - upperBodyLength * Math.cos(bodyRad);
        
        ctx.beginPath();
        ctx.moveTo(waistX, waistY);
        ctx.lineTo(shoulderX, shoulderY);
        ctx.stroke();
        
        // Head
        ctx.beginPath();
        ctx.arc(shoulderX, shoulderY - headRadius, headRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Joint markers for shoulders and waist
        ctx.fillStyle = '#66BB6A';
        ctx.beginPath();
        ctx.arc(shoulderX, shoulderY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(waistX, waistY, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // LEFT ARM
        const lShoulderRad = (adjustedPose.lShoulder + adjustedPose.body + adjustedPose.waist) * Math.PI / 180;
        const lElbowX = shoulderX - upperArmLength * Math.sin(lShoulderRad);
        const lElbowY = shoulderY - upperArmLength * Math.cos(lShoulderRad);
        
        // Upper arm
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(lElbowX, lElbowY);
        ctx.stroke();
        
        // Elbow joint
        ctx.fillStyle = '#66BB6A';
        ctx.beginPath();
        ctx.arc(lElbowX, lElbowY, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Forearm
        const lForearmRad = (adjustedPose.lShoulder + adjustedPose.lElbow + adjustedPose.body + adjustedPose.waist) * Math.PI / 180;
        const lHandX = lElbowX - forearmLength * Math.sin(lForearmRad);
        const lHandY = lElbowY - forearmLength * Math.cos(lForearmRad);
        
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        ctx.moveTo(lElbowX, lElbowY);
        ctx.lineTo(lHandX, lHandY);
        ctx.stroke();
        
        // RIGHT ARM
        const rShoulderRad = (adjustedPose.rShoulder + adjustedPose.body + adjustedPose.waist) * Math.PI / 180;
        const rElbowX = shoulderX + upperArmLength * Math.sin(rShoulderRad);
        const rElbowY = shoulderY - upperArmLength * Math.cos(rShoulderRad);
        
        // Upper arm
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(rElbowX, rElbowY);
        ctx.stroke();
        
        // Elbow joint
        ctx.fillStyle = '#66BB6A';
        ctx.beginPath();
        ctx.arc(rElbowX, rElbowY, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Forearm
        const rForearmRad = (adjustedPose.rShoulder + adjustedPose.rElbow + adjustedPose.body + adjustedPose.waist) * Math.PI / 180;
        const rHandX = rElbowX + forearmLength * Math.sin(rForearmRad);
        const rHandY = rElbowY - forearmLength * Math.cos(rForearmRad);
        
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        ctx.moveTo(rElbowX, rElbowY);
        ctx.lineTo(rHandX, rHandY);
        ctx.stroke();
        
        // LEFT LEG (from bottom of body)
        const lHipRad = adjustedPose.lHip * Math.PI / 180;
        const lKneeX = -thighLength * Math.sin(lHipRad);
        const lKneeY = thighLength * Math.cos(lHipRad);
        
        // Thigh
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(lKneeX, lKneeY);
        ctx.stroke();
        
        // Knee joint
        ctx.fillStyle = '#66BB6A';
        ctx.beginPath();
        ctx.arc(lKneeX, lKneeY, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Shin
        const lShinRad = (pose.lHip + pose.lKnee) * Math.PI / 180;
        const lFootX = lKneeX - shinLength * Math.sin(lShinRad);
        const lFootY = lKneeY + shinLength * Math.cos(lShinRad);
        
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        ctx.moveTo(lKneeX, lKneeY);
        ctx.lineTo(lFootX, lFootY);
        ctx.stroke();
        
        // RIGHT LEG (from bottom of body)
        const rHipRad = pose.rHip * Math.PI / 180;
        const rKneeX = thighLength * Math.sin(rHipRad);
        const rKneeY = thighLength * Math.cos(rHipRad);
        
        // Thigh
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(rKneeX, rKneeY);
        ctx.stroke();
        
        // Knee joint
        ctx.fillStyle = '#66BB6A';
        ctx.beginPath();
        ctx.arc(rKneeX, rKneeY, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Shin
        const rShinRad = (pose.rHip + pose.rKnee) * Math.PI / 180;
        const rFootX = rKneeX + shinLength * Math.sin(rShinRad);
        const rFootY = rKneeY + shinLength * Math.cos(rShinRad);
        
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        ctx.moveTo(rKneeX, rKneeY);
        ctx.lineTo(rFootX, rFootY);
        ctx.stroke();
        
        ctx.restore();
    }
    
    showScore() {
        // Calculate score based on dance plan
        const uniquePoses = new Set(this.dancePlan.keyframes.map(kf => kf.pose)).size;
        const creativity = Math.min(10, Math.round((uniquePoses / 10) * 10));
        
        const avgTime = this.dancePlan.duration / this.dancePlan.keyframes.length;
        const energy = Math.min(10, Math.round(10 - (avgTime - 0.5) * 2));
        
        const styles = ['Robot Disco', 'Jazz Funk', 'Hip Hop Flow', 'Ballet Grace', 'Breakdance Energy'];
        const style = styles[Math.floor(Math.random() * styles.length)];
        
        document.getElementById('scoreCreativity').textContent = `${creativity}/10`;
        document.getElementById('scoreEnergy').textContent = `${energy}/10`;
        document.getElementById('scoreStyle').textContent = style;
        
        this.scoreDiv.style.display = 'block';
        
        // Narrator score announcement
        if (this.narrator) {
            setTimeout(() => {
                this.narrator.speak(`Your style is ${style}!`);
            }, 1000);
        }
    }
    
    // ===== TESTING UTILITIES (Phase 3) =====
    
    /**
     * Test with mock transcript - useful for development
     * Usage: window.testDance("wave arms then spin")
     */
    testWithTranscript(transcript) {
        const mockPlan = {
            duration: 12.0,
            keyframes: [
                {time: 0.0, pose: "IDLE"},
                {time: 2.0, pose: "ARMS_UP"},
                {time: 4.0, pose: "ARMS_WAVE_LEFT"},
                {time: 6.0, pose: "SPIN_RIGHT"},
                {time: 8.0, pose: "KICK_RIGHT"},
                {time: 10.0, pose: "BOW"},
                {time: 12.0, pose: "IDLE"}
            ]
        };
        
        console.log('[Test] Running mock dance with transcript:', transcript);
        this.receiveDancePlan(mockPlan, transcript || "Test dance sequence");
    }
    
    /**
     * Test all poses - cycles through all available poses
     */
    testAllPoses() {
        const poses = ['IDLE', 'ARMS_UP', 'ARMS_WAVE_LEFT', 'ARMS_WAVE_RIGHT', 
                      'SPIN_LEFT', 'SPIN_RIGHT', 'KICK_LEFT', 'KICK_RIGHT', 'JUMP', 'BOW'];
        
        const keyframes = poses.map((pose, i) => ({
            time: i * 1.5,
            pose: pose
        }));
        
        const mockPlan = {
            duration: poses.length * 1.5,
            keyframes: keyframes
        };
        
        console.log('[Test] Testing all poses:', poses);
        this.receiveDancePlan(mockPlan, "Testing all dance poses");
    }
    
    /**
     * Toggle narrator on/off
     */
    toggleNarrator() {
        this.narratorEnabled = !this.narratorEnabled;
        console.log('[Dance] Narrator', this.narratorEnabled ? 'enabled' : 'disabled');
        return this.narratorEnabled;
    }
}

// Initialize immediately (scripts are loaded dynamically after DOM is ready)
(function initializeDance() {
    console.log('[Dance] ========== Initialization starting ==========');
    console.log('[Dance] document.readyState:', document.readyState);
    console.log('[Dance] window.wsClient exists:', !!window.wsClient);
    console.log('[Dance] danceCanvas exists:', !!document.getElementById('danceCanvas'));
    
    if (!window.wsClient) {
        console.error('[Dance] ERROR: window.wsClient not found!');
        console.error('[Dance] Available window properties:', Object.keys(window).filter(k => k.includes('ws') || k.includes('WebSocket')));
        return;
    }
    
    if (!document.getElementById('danceCanvas')) {
        console.error('[Dance] ERROR: danceCanvas not found!');
        return;
    }
    
    // Connect WebSocket
    console.log('[Dance] Connecting to WebSocket...');
    window.wsClient.connect();
    
    console.log('[Dance] Creating DanceManager...');
    window.danceManager = new DanceManager(window.wsClient);
    console.log('[Dance] Manager initialized');
    
    // Expose test functions globally (Phase 3)
    window.testDance = (transcript) => window.danceManager.testWithTranscript(transcript);
    window.testAllPoses = () => window.danceManager.testAllPoses();
    window.toggleNarrator = () => window.danceManager.toggleNarrator();
    
    console.log('[Dance] Test functions available: testDance(), testAllPoses(), toggleNarrator()');
    console.log('[Dance] ========== Initialization complete ==========');
})();
