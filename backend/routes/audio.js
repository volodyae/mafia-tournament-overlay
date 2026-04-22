const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// GET /api/audio — список аудиофайлов
router.get('/', (req, res) => {
    const audioDir = path.join(__dirname, '../../frontend/audio');

    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
        return res.json([]);
    }

    try {
        const files = fs.readdirSync(audioDir)
            .filter(f => /\.(mp3|ogg|wav|m4a|aac|flac)$/i.test(f))
            .sort((a, b) => a.localeCompare(b, 'ru'))
            .map(f => ({
                filename: f,
                name: f.replace(/\.[^.]+$/, ''),
                url: `/audio/${f}`
            }));

        res.json(files);
    } catch (error) {
        console.error('Error reading audio dir:', error);
        res.status(500).json({ error: 'Failed to read audio files' });
    }
});

module.exports = router;
