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
        
        // Particle system for visual effects
        this.particles = [];
        
        // AI Narrator
        this.narrator = this.initializeNarrator();
        this.narratorEnabled = true;
        
        this.initializeUI();
        this.setupWebSocketHandlers();
    }
    
    initializeUI() {
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
        
        if (this.startBtn) {
            this.startBtn.addEventListener('click', () => this.startRecording());
        }
        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => this.finishRecording());
        }
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.cancelRecording());
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
    
    startRecording() {
        if (!this.wsClient.socket || this.wsClient.socket.readyState !== WebSocket.OPEN) {
            alert('Not connected to server. Please wait...');
            return;
        }
        
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
        
        // Send start message
        this.wsClient.socket.send(JSON.stringify({
            type: 'start_dance'
        }));
        
        this.updateStatus('🎤 Describe your dance... Click "Done" when finished!');
        this.startTimer();
    }
    
    cancelRecording() {
        if (!this.isRecording) return;
        
        this.wsClient.socket.send(JSON.stringify({
            type: 'cancel_dance'
        }));
        
        this.stopRecording();
        this.updateStatus('Cancelled. Ready to record.');
    }
    
    finishRecording() {
        if (!this.isRecording) return;
        
        const elapsed = (Date.now() - this.recordingStartTime) / 1000;
        
        // Require at least 3 seconds of recording
        if (elapsed < 3) {
            alert('Please record at least 3 seconds of description!');
            return;
        }
        
        // Send finish message to process immediately
        this.wsClient.socket.send(JSON.stringify({
            type: 'finish_dance'
        }));
        
        this.stopRecording();
        this.updateStatus('Processing your dance...');
    }
    
    stopRecording() {
        this.isRecording = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.cancelBtn.disabled = true;
        
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
            this.statusText.textContent = message;
        }
    }
    
    handleDanceMessage(msg) {
        switch (msg.type) {
            case 'dance_recording_started':
                console.log('[Dance] Recording started');
                break;
                
            case 'dance_recording_progress':
                console.log(`[Dance] Progress: ${msg.elapsed.toFixed(1)}s / ${this.recordingDuration}s`);
                break;
                
            case 'dance_status':
                this.updateStatus(msg.message);
                break;
                
            case 'dance_plan':
                this.stopRecording();
                this.receiveDancePlan(msg.plan, msg.transcript);
                break;
                
            case 'dance_error':
                this.stopRecording();
                this.updateStatus(`❌ Error: ${msg.message}`);
                alert(msg.message);
                break;
                
            case 'dance_cancelled':
                this.stopRecording();
                console.log('[Dance] Cancelled');
                break;
        }
    }
    
    receiveDancePlan(plan, transcript) {
        console.log('[Dance] Received plan:', plan);
        
        this.dancePlan = plan;
        this.transcriptDiv.textContent = `"${transcript}"`;
        
        this.updateStatus('🎭 Dancing!');
        
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
            this.updateStatus('✨ Dance complete!');
            if (this.narrator) {
                this.narrator.speak('Fantastic performance!');
            }
            this.showScore();
            return;
        }
        
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
        const easedT = this.easeInOutCubic(t);
        
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
    
    getPoseAngles(poseName) {
        const POSE_LIBRARY = {
            IDLE: { body: 0, lArm: 0, rArm: 0, lLeg: 0, rLeg: 0, rotation: 0 },
            ARMS_UP: { body: 0, lArm: 90, rArm: 90, lLeg: 0, rLeg: 0, rotation: 0 },
            ARMS_WAVE_LEFT: { body: 0, lArm: 90, rArm: -20, lLeg: 0, rLeg: 0, rotation: 0 },
            ARMS_WAVE_RIGHT: { body: 0, lArm: -20, rArm: 90, lLeg: 0, rLeg: 0, rotation: 0 },
            SPIN_LEFT: { body: 0, lArm: 45, rArm: 45, lLeg: 0, rLeg: 0, rotation: -180 },
            SPIN_RIGHT: { body: 0, lArm: 45, rArm: 45, lLeg: 0, rLeg: 0, rotation: 180 },
            KICK_LEFT: { body: 10, lArm: -30, rArm: -30, lLeg: 90, rLeg: 0, rotation: 0 },
            KICK_RIGHT: { body: 10, lArm: -30, rArm: -30, lLeg: 0, rLeg: 90, rotation: 0 },
            JUMP: { body: 0, lArm: 45, rArm: 45, lLeg: 45, rLeg: 45, rotation: 0, jumpOffset: -50 },
            BOW: { body: -45, lArm: -20, rArm: -20, lLeg: 0, rLeg: 0, rotation: 0 }
        };
        
        return POSE_LIBRARY[poseName] || POSE_LIBRARY.IDLE;
    }
    
    interpolatePoses(pose1, pose2, t) {
        const lerp = (a, b, t) => a + (b - a) * t;
        
        return {
            body: lerp(pose1.body, pose2.body, t),
            lArm: lerp(pose1.lArm, pose2.lArm, t),
            rArm: lerp(pose1.rArm, pose2.rArm, t),
            lLeg: lerp(pose1.lLeg, pose2.lLeg, t),
            rLeg: lerp(pose1.rLeg, pose2.rLeg, t),
            rotation: lerp(pose1.rotation || 0, pose2.rotation || 0, t),
            jumpOffset: lerp(pose1.jumpOffset || 0, pose2.jumpOffset || 0, t)
        };
    }
    
    easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    drawStickFigure(pose) {
        const ctx = this.ctx;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2 + (pose.jumpOffset || 0);
        
        const headRadius = 30;
        const bodyLength = 100;
        const armLength = 60;
        const legLength = 80;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(pose.rotation * Math.PI / 180);
        
        // Draw style with glow
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#4CAF50';
        ctx.fillStyle = '#4CAF50';
        ctx.shadowColor = '#4CAF50';
        ctx.shadowBlur = 20;
        
        // Head
        ctx.beginPath();
        ctx.arc(0, -bodyLength - headRadius, headRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Body
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -bodyLength);
        ctx.stroke();
        
        // Left arm
        const lArmRad = pose.lArm * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, -bodyLength + 20);
        ctx.lineTo(
            -armLength * Math.sin(lArmRad),
            -bodyLength + 20 - armLength * Math.cos(lArmRad)
        );
        ctx.stroke();
        
        // Right arm
        const rArmRad = pose.rArm * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, -bodyLength + 20);
        ctx.lineTo(
            armLength * Math.sin(rArmRad),
            -bodyLength + 20 - armLength * Math.cos(rArmRad)
        );
        ctx.stroke();
        
        // Left leg
        const lLegRad = pose.lLeg * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
            -legLength * Math.sin(lLegRad),
            legLength * Math.cos(lLegRad)
        );
        ctx.stroke();
        
        // Right leg
        const rLegRad = pose.rLeg * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
            legLength * Math.sin(rLegRad),
            legLength * Math.cos(rLegRad)
        );
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

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    if (window.wsClient && document.getElementById('danceCanvas')) {
        window.danceManager = new DanceManager(window.wsClient);
        console.log('[Dance] Manager initialized');
        
        // Expose test functions globally (Phase 3)
        window.testDance = (transcript) => window.danceManager.testWithTranscript(transcript);
        window.testAllPoses = () => window.danceManager.testAllPoses();
        window.toggleNarrator = () => window.danceManager.toggleNarrator();
        
        console.log('[Dance] Test functions available: testDance(), testAllPoses(), toggleNarrator()');
    }
});
