class AudioManager {
    constructor() {
        this.audioCtx = null;
        this.assetPath = "../res/audio/"; // Verify this matches your folder exactly
        this.banks = {
            paddle_hits: [],
            wall_bounces: [],
            score_sounds: [],
            miss_sounds: []
        };
        this.isLoaded = false;
    }

    async init() {
        if (this.audioCtx) return;
        console.log("Audio Engine: Initializing...");
        
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Resume context (required for some browsers)
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        
        await this.loadAssets();
    }

    async loadSound(fileName) {
        const url = this.assetPath + fileName;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        return await this.audioCtx.decodeAudioData(arrayBuffer);
    }

    async loadAssets() {
        try {
            // Use Promise.all to load everything in parallel (faster)
            const loads = [
                this.loadSound("ping1.wav").then(s => this.banks.paddle_hits.push(s)),
                this.loadSound("ping2.wav").then(s => this.banks.paddle_hits.push(s)),
                this.loadSound("ping3.wav").then(s => this.banks.paddle_hits.push(s)),
                this.loadSound("pan_clang.wav").then(s => this.banks.paddle_hits.push(s)),
                this.loadSound("battery_spring.wav").then(s => this.banks.wall_bounces.push(s)),
                this.loadSound("whistle-upset-sound.wav").then(s => this.banks.miss_sounds.push(s)),
                this.loadSound("yay.wav").then(s => this.banks.score_sounds.push(s)),
                this.loadSound("yahoo.wav").then(s => this.banks.score_sounds.push(s)),
                this.loadSound("yeah.wav").then(s => this.banks.score_sounds.push(s))
            ];

            await Promise.all(loads);
            this.isLoaded = true;
            console.log("Audio Engine: All assets loaded and ready!");
        } catch (e) {
            console.error("Audio Engine Error:", e);
        }
    }

    _playFromBank(bankName, x, volume = 1.0) {
        if (!this.isLoaded || !this.audioCtx) {
            console.warn(`Audio not ready. Bank: ${bankName}`);
            return;
        }

        const bank = this.banks[bankName];
        if (!bank || bank.length === 0) return;

        const buffer = bank[Math.floor(Math.random() * bank.length)];
        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;

        // Spatial Panning
        const panValue = Math.max(-1, Math.min(1, (x * 2) - 1));
        const panNode = new StereoPannerNode(this.audioCtx, { pan: panValue });
        
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = volume;

        source.connect(panNode).connect(gainNode).connect(this.audioCtx.destination);
        source.start(0);
    }

    play_hit(x, y, velocity) { this._playFromBank('paddle_hits', x, 0.8); }
    play_bounce(x, y) { this._playFromBank('wall_bounces', x, 0.5); }
    play_score(id) { this._playFromBank('score_sounds', (id === 1 ? 1 : 0), 1.0); }
    play_miss(id) { this._playFromBank('miss_sounds', (id === 0 ? 1 : 0), 1.0); }
}

const audioEngine = new AudioManager();