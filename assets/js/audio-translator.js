document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const API_CONFIG = {
        URL: "https://toprn-audiotranslator.hf.space/translate",
        FILE_URL: "https://toprn-audiotranslator.hf.space/file=",
        TIMEOUT: 300000 // 5 minutes
    };
    const UI_STRINGS = {
        TRANSLATE_NOW: 'الخطوة 3: ترجم الآن <i class="fas fa-language"></i>',
        UPLOADING: 'جاري الرفع...',
        PROCESSING: 'جاري المعالجة الآن...',
        UPLOAD_SUCCESS: 'تم الرفع بنجاح!',
        CANCEL_ICON: '<i class="fas fa-times"></i>',
        RESET_ICON: '<i class="fas fa-sync-alt"></i>',
        RECORD_NOW: 'سجل من المايكروفون <i class="fas fa-microphone"></i>',
        STOP_RECORDING: 'أوقف التسجيل <i class="fas fa-stop"></i>',
        COPY_SUCCESS_ICON: '<i class="fas fa-check"></i>',
        COPY_SUCCESS_TITLE: 'تم النسخ!',
    };
    const HIDDEN_CLASS = 'hidden';

    // --- DOM Element Cache ---
    const ui = {
        audioFileInput: document.getElementById('audio-file-input'),
        recordBtn: document.getElementById('record-btn'),
        sourceLanguageSelect: document.getElementById('source-language-select'),
        recordedAudioPlayer: document.getElementById('recorded-audio-player'),
        languageSelect: document.getElementById('language-select'),
        speedSelect: document.getElementById('speed-select'),
        translateBtn: document.getElementById('translate-btn'),
        loader: document.getElementById('translator-loader'),
        errorDisplay: document.getElementById('error-display'),
        transcribedText: document.getElementById('transcribed-text'),
        copyBtn: document.getElementById('copy-btn'),
        copyTranscribedBtn: document.getElementById('copy-transcribed-btn'),
        translatedText: document.getElementById('translated-text'),
        ttsOutputContainer: document.getElementById('tts-output-container'),
        ttsAudioPlayer: document.getElementById('tts-audio-player'),
        downloadTtsLink: document.getElementById('download-tts-link'),
        loaderText: document.getElementById('loader-text'),
        progressContainer: document.getElementById('progress-container'),
        progressText: document.getElementById('progress-text'),
        progressBar: document.getElementById('progress-bar'),
        processingSpinner: document.getElementById('processing-spinner'),
        resetBtn: document.getElementById('reset-btn'),
        currentTimeEl: document.getElementById('current-time'),
        totalDurationEl: document.getElementById('total-duration'),
        recordingStatus: document.getElementById('recording-status'),
        recordingTimer: document.getElementById('recording-timer'),
        audioErrorContainer: document.getElementById('audio-error-container'),
        retryAudioBtn: document.getElementById('retry-audio-btn'),
        audioTimeDisplay: document.querySelector('.audio-time-display'),
        audioPreviewContainer: document.getElementById('audio-preview-container'),
        clearAudioBtn: document.getElementById('clear-audio-btn'),
        transcriptionNote: document.getElementById('transcription-note'),
        voiceSelect: document.getElementById('voice-select'),
    };

    // --- State Variables ---
    let mediaRecorder;
    let audioChunks = [];
    let audioBlob = null;
    let isRecording = false;
    let processingInterval = null;
    let recordingInterval;

    // --- Collapsible Fieldsets ---
    document.querySelectorAll('.translator-controls fieldset').forEach(fieldset => {
        const legend = fieldset.querySelector('legend');
        const content = fieldset.querySelector('.collapsible-content');

        if (!legend || !content) { return; }

        // Keep the first fieldset ("أدخل الصوت") open by default.
        const isFirstFieldset = fieldset.querySelector('#audio-file-input') !== null;
        if (!isFirstFieldset) {
            legend.classList.add('collapsed');
            content.classList.add('collapsed');
        }

        legend.addEventListener('click', () => {
            legend.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
        });
    });




    // --- Functions ---
    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    const updateTranslateButtonState = () => {
        const hasAudio = !!audioBlob;
        ui.translateBtn.disabled = !hasAudio;

        if (hasAudio) {
            ui.resetBtn.classList.remove(HIDDEN_CLASS);
        } else {
            ui.resetBtn.classList.add(HIDDEN_CLASS);
        }
    };

    const resetProcessingState = () => {
        ui.loader.classList.add(HIDDEN_CLASS);
        // Re-enable the translate button only if there's audio
        updateTranslateButtonState();
        ui.translateBtn.innerHTML = UI_STRINGS.TRANSLATE_NOW;
        ui.processingSpinner.classList.add(HIDDEN_CLASS);
        ui.progressContainer.classList.add(HIDDEN_CLASS);
        ui.loaderText.textContent = UI_STRINGS.PROCESSING;
        ui.progressBar.style.width = '0%';
        ui.progressBar.classList.remove('processing'); // Remove processing class
        ui.progressText.classList.add(HIDDEN_CLASS);
        ui.resetBtn.innerHTML = UI_STRINGS.RESET_ICON; // Change back to reset icon
    };
    const stopProcessingSimulation = () => {
        if (processingInterval) clearInterval(processingInterval);
    };

    const clearResults = () => {
        ui.errorDisplay.classList.add(HIDDEN_CLASS);
        ui.transcribedText.value = '';
        ui.copyTranscribedBtn.disabled = true;
        ui.copyBtn.disabled = true;
        ui.translatedText.value = '';
        ui.ttsOutputContainer.classList.add(HIDDEN_CLASS);
        ui.ttsAudioPlayer.src = '';
        ui.downloadTtsLink.href = '#';
        ui.downloadTtsLink.classList.add(HIDDEN_CLASS);
        ui.currentTimeEl.textContent = '00:00';
        ui.totalDurationEl.textContent = '00:00';
        ui.audioErrorContainer.classList.add(HIDDEN_CLASS);
        ui.audioTimeDisplay.classList.remove(HIDDEN_CLASS);
        ui.transcriptionNote.classList.add(HIDDEN_CLASS);
    };

    const resetUI = () => {
        stopProcessingSimulation();
        resetProcessingState();
        clearResults();
    };
    
    let abortController = null;


    const fetchWithProgress = (url, opts = {}, onProgress) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(opts.method || 'get', url);

            for (const k in opts.headers || {}) {
                xhr.setRequestHeader(k, opts.headers[k]);
            }

            if (opts.signal) {
                opts.signal.addEventListener('abort', () => xhr.abort());
            }

            xhr.onload = e => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve({
                            ok: true,
                            status: xhr.status,
                            json: () => Promise.resolve(JSON.parse(e.target.responseText))
                        });
                    } catch (parseError) {
                        reject(new Error("Failed to parse JSON response."));
                    }
                } else {
                    resolve({
                        ok: false,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        json: () => {
                            try { return Promise.resolve(JSON.parse(e.target.responseText)); } 
                            catch { return Promise.resolve({}); }
                        }
                    });
                }
            };

            xhr.onerror = () => reject(new TypeError('فشل طلب الشبكة.'));
            xhr.onabort = () => reject({ name: 'AbortError', message: 'تم إلغاء الطلب.' });
            xhr.ontimeout = () => reject(new Error('انتهت مهلة الطلب.'));
            xhr.timeout = API_CONFIG.TIMEOUT;
            if (xhr.upload && onProgress) xhr.upload.onprogress = onProgress;

            xhr.send(opts.body);
        });
    };

    const handleApiError = async (error, response = null) => {
        console.error('API Error:', error);
        let message;

        if (error.name === 'AbortError') {
            message = 'تم إلغاء عملية الترجمة.';
        } else if (error.message.includes('مهلة الطلب')) {
            message = 'استغرقت العملية وقتاً طويلاً جداً. يرجى المحاولة مرة أخرى أو تجربة ملف أصغر.';
        } else if (response) {
            if (response.status === 429) {
                message = 'لقد وصلت إلى الحد الأقصى للطلبات. يرجى الانتظار قليلاً قبل المحاولة مرة أخرى.';
            } else if (response.status === 503) {
                message = 'الخدمة مشغولة حاليًا أو قيد التحميل (Cold Start). يرجى المحاولة مرة أخرى بعد دقيقة.';
            } else {
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        message = `خطأ من الخادم: ${errorData.error}. قد يكون الملف الصوتي غير صالح.`;
                    } else {
                        message = `حدث خطأ في الخادم (الحالة: ${response.status}).`;
                    }
                } catch (e) {
                    message = `حدث خطأ في الخادم (الحالة: ${response.status}). لا يمكن قراءة تفاصيل الخطأ.`;
                }
            }
        } else {
            message = 'حدث خطأ غير متوقع. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.';
        }

        ui.errorDisplay.textContent = message;
        ui.errorDisplay.classList.remove(HIDDEN_CLASS);
        resetUI();
    };

    const cancelTranslation = () => {
        if (abortController) {
            stopProcessingSimulation();
            abortController.abort();
            console.log("Translation cancelled by user.");
        }
    };

    const fullReset = () => {
        // Stop recording if it's active
        if (isRecording && mediaRecorder) {
            // The onstop handler will manage resetting the record button UI
            clearInterval(recordingInterval);
            ui.recordingStatus.classList.add(HIDDEN_CLASS);
            mediaRecorder.stop();
        }

        // Clear audio state
        audioBlob = null;
        ui.audioFileInput.value = ''; // This is crucial for file input
        ui.recordedAudioPlayer.src = '';
        ui.audioPreviewContainer.classList.add(HIDDEN_CLASS); // Hide the entire preview container

        // Clear results and loader state
        resetUI(); 
        // Update buttons state (this will disable translate and hide reset)
        updateTranslateButtonState();
    };

    const handleResetOrCancel = () => {
        // If the loader is visible, it means we are in a processing state, so we cancel.
        // Otherwise, we perform a full reset.
        ui.loader.classList.contains(HIDDEN_CLASS) ? fullReset() : cancelTranslation();
    };

    const clearAudioSelection = () => {
        audioBlob = null;
        ui.audioFileInput.value = ''; // Reset file input
        ui.recordedAudioPlayer.src = ''; // Clear the player source
        ui.audioPreviewContainer.classList.add(HIDDEN_CLASS); // Hide the container
        updateTranslateButtonState();
    };

    // --- User Preferences ---
    const loadPreferences = () => {
        const savedLanguage = localStorage.getItem('translator_last_language');
        // Ensure the saved language is a valid option before setting it
        if (savedLanguage && [...ui.languageSelect.options].some(opt => opt.value === savedLanguage)) {
            ui.languageSelect.value = savedLanguage;
        }
        const savedSpeed = localStorage.getItem('translator_last_speed');
        if (savedSpeed && [...ui.speedSelect.options].some(opt => opt.value === savedSpeed)) {
            ui.speedSelect.value = savedSpeed;
        }
        // Set the initial playback rate from the current selection
        ui.ttsAudioPlayer.playbackRate = parseFloat(ui.speedSelect.value);
    };

    const savePreferences = () => {
        localStorage.setItem('translator_last_language', ui.languageSelect.value);
        localStorage.setItem('translator_last_speed', ui.speedSelect.value);
    };

    const handleAudioReady = () => {
        ui.downloadTtsLink.classList.remove(HIDDEN_CLASS);
        // Ensure error state is cleared and time is visible
        ui.audioErrorContainer.classList.add(HIDDEN_CLASS);
        ui.audioTimeDisplay.classList.remove(HIDDEN_CLASS);
    };

    const handleAudioLoadError = () => {
        console.error("Audio player error:", ui.ttsAudioPlayer.error);
        ui.audioTimeDisplay.classList.add(HIDDEN_CLASS);
        ui.downloadTtsLink.classList.add(HIDDEN_CLASS);
        ui.audioErrorContainer.classList.remove(HIDDEN_CLASS);
    };

    const retryAudioLoad = () => {
        ui.audioErrorContainer.classList.add(HIDDEN_CLASS);
        ui.ttsAudioPlayer.load(); // This will re-trigger the loading process
    };

    // --- Initial Setup ---
    loadPreferences();

    // --- Event Listeners ---
    ui.resetBtn.addEventListener('click', handleResetOrCancel);

    ui.retryAudioBtn.addEventListener('click', retryAudioLoad);

    ui.clearAudioBtn.addEventListener('click', clearAudioSelection);

    ui.audioFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
            audioBlob = file;
            const audioUrl = URL.createObjectURL(file);
            ui.recordedAudioPlayer.src = audioUrl;
            ui.audioPreviewContainer.classList.remove(HIDDEN_CLASS);
            updateTranslateButtonState();
        }
    });

    ui.languageSelect.addEventListener('change', savePreferences);

    ui.speedSelect.addEventListener('change', () => {
        const newSpeed = parseFloat(ui.speedSelect.value);
        ui.ttsAudioPlayer.playbackRate = newSpeed;
        savePreferences();
    });

    ui.ttsAudioPlayer.addEventListener('canplay', handleAudioReady);

    ui.ttsAudioPlayer.addEventListener('error', handleAudioLoadError);

    ui.ttsAudioPlayer.addEventListener('loadedmetadata', () => {
        ui.totalDurationEl.textContent = formatTime(ui.ttsAudioPlayer.duration);
    });

    ui.ttsAudioPlayer.addEventListener('timeupdate', () => {
        ui.currentTimeEl.textContent = formatTime(ui.ttsAudioPlayer.currentTime);
    });


    ui.recordBtn.addEventListener('click', async () => {
        if (isRecording) {
            clearInterval(recordingInterval);
            ui.recordingStatus.classList.add(HIDDEN_CLASS);
            mediaRecorder.stop();
            // The onstop handler will manage the rest of the UI update
        } else {
            // Start recording
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

                mediaRecorder.onstop = () => {
                    audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    ui.recordedAudioPlayer.src = URL.createObjectURL(audioBlob);
                    ui.audioPreviewContainer.classList.remove(HIDDEN_CLASS);
                    updateTranslateButtonState();
                    stream.getTracks().forEach(track => track.stop());

                    // Reset recording state and UI
                    isRecording = false;
                    ui.recordBtn.innerHTML = UI_STRINGS.RECORD_NOW;
                    ui.recordBtn.style.backgroundColor = ''; // Revert to stylesheet color
                };

                mediaRecorder.start();

                // Update recording state and UI
                isRecording = true;
                ui.recordBtn.innerHTML = UI_STRINGS.STOP_RECORDING;
                ui.recordBtn.style.backgroundColor = '#d9534f'; // A red color for "stop"
                updateTranslateButtonState();
                ui.audioPreviewContainer.classList.add(HIDDEN_CLASS); // Hide old recording preview
                ui.errorDisplay.classList.add(HIDDEN_CLASS); // Hide any previous errors

                // Reset and show timer
                ui.recordingTimer.textContent = '00:00';
                ui.recordingStatus.classList.remove(HIDDEN_CLASS);
                let recordingSeconds = 0;
                recordingInterval = setInterval(() => {
                    recordingSeconds++;
                    ui.recordingTimer.textContent = formatTime(recordingSeconds);
                }, 1000);

            } catch (err) {
                console.error("Error accessing microphone:", err);
                ui.errorDisplay.textContent = "لم نتمكن من الوصول إلى المايكروفون. يرجى التأكد من منح الإذن اللازم في متصفحك.";
                ui.errorDisplay.classList.remove(HIDDEN_CLASS);
                ui.recordBtn.disabled = true;
                ui.recordingStatus.classList.add(HIDDEN_CLASS);
                clearInterval(recordingInterval);
            }
        }
    });

    ui.translateBtn.addEventListener('click', async () => {
        if (!audioBlob) { return alert('الرجاء اختيار ملف صوتي أو تسجيل مقطع أولاً.'); }
        
        abortController = new AbortController();

        try {
            const base64Audio = await fileToBase64(audioBlob);
            const sourceLanguage = ui.sourceLanguageSelect.value;
            const targetLanguage = ui.languageSelect.value;
            const voice = ui.voiceSelect.value;
            // New payload structure for FastAPI
            const payload = {
                "audio_data": base64Audio,
                "source_language": sourceLanguage,
                "target_language": targetLanguage,
                "voice": voice
            };

            // --- UI Update for Upload ---
            clearResults(); // Reset previous results
            ui.loader.classList.remove(HIDDEN_CLASS);
            ui.translateBtn.disabled = true;
            ui.translateBtn.textContent = UI_STRINGS.UPLOADING;
            ui.resetBtn.innerHTML = UI_STRINGS.CANCEL_ICON;
            ui.processingSpinner.classList.add(HIDDEN_CLASS); // Keep spinner hidden during upload
            ui.progressContainer.classList.remove(HIDDEN_CLASS);
            ui.progressText.classList.remove(HIDDEN_CLASS);
            ui.progressBar.style.width = '0%';
            ui.progressText.textContent = '0%';

            const onUploadProgress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    ui.progressText.textContent = `${percentComplete}%`;
                    ui.progressBar.style.width = `${percentComplete}%`;
                    ui.loaderText.textContent = `${UI_STRINGS.UPLOADING} ${percentComplete}%`;
                }
            };

            const response = await fetchWithProgress(API_CONFIG.URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: abortController.signal
            }, onUploadProgress);

            // --- UI Update for Upload Success ---
            ui.loaderText.textContent = UI_STRINGS.UPLOAD_SUCCESS;
            ui.progressBar.classList.add('processing'); // Change color to orange

            // Short delay to show the "Upload successful" message before starting processing simulation
            await new Promise(resolve => setTimeout(resolve, 1000));

            // --- UI Update for Processing Phase ---
            ui.loaderText.textContent = UI_STRINGS.PROCESSING;
            ui.processingSpinner.classList.remove(HIDDEN_CLASS); // Show the spinning arrow
            
            // Simulate processing progress from 0%
            let processingProgress = 0;
            ui.progressBar.style.width = '0%';
            ui.progressText.textContent = '0%';

            stopProcessingSimulation();
            processingInterval = setInterval(() => {
                if (processingProgress < 95) {
                    processingProgress += 1;
                    ui.progressText.textContent = `${processingProgress}%`;
                    ui.progressBar.style.width = `${processingProgress}%`;
                }
            }, 1500);

            if (!response.ok) {
                await handleApiError(new Error('Server responded with an error'), response);
                return;
            }

            const result = await response.json();

            // New response structure from FastAPI
            const translation = result.translation;
            const ttsFile = result.tts_file;

            // --- UI Update for Completion ---
            stopProcessingSimulation(); // Stop the simulation
            ui.progressText.textContent = '100%';
            ui.progressBar.style.width = '100%'; // Show 100% on completion
            
            // The new API does not provide transcription, so we hide it.
            ui.transcribedText.value = "النص الأصلي غير متوفر من هذه الواجهة البرمجية.";
            ui.transcriptionNote.classList.remove(HIDDEN_CLASS);
            ui.copyTranscribedBtn.disabled = true;

            if (translation) {
                ui.translatedText.value = translation;
                ui.copyBtn.disabled = false; // Enable copy button
            } else {
                ui.translatedText.value = "فشلت الترجمة.";
                ui.copyBtn.disabled = true; // Ensure it's disabled
            }

            if (ttsFile && ttsFile.name) {
                const ttsUrl = API_CONFIG.FILE_URL + ttsFile.name;
                ui.ttsAudioPlayer.src = ttsUrl;
                ui.downloadTtsLink.href = ttsUrl;
                ui.downloadTtsLink.download = "translated_audio.wav";
                ui.ttsOutputContainer.classList.remove(HIDDEN_CLASS);
            }
        } catch (error) {
            await handleApiError(error);
        } finally {
            abortController = null;
            stopProcessingSimulation();
            resetProcessingState();
        }
    });

    const setupCopyButton = (button, textarea) => {
        button.addEventListener('click', () => {
            const textToCopy = textarea.value;
            if (!textToCopy || button.disabled) return;

            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalIcon = button.innerHTML;
                const originalTitle = button.title;
                button.innerHTML = UI_STRINGS.COPY_SUCCESS_ICON;
                button.title = UI_STRINGS.COPY_SUCCESS_TITLE;
                setTimeout(() => {
                    button.innerHTML = originalIcon;
                    button.title = originalTitle;
                }, 2000);
            }).catch(err => { console.error('Failed to copy text: ', err); });
        });
    };
    setupCopyButton(ui.copyBtn, ui.translatedText);
    setupCopyButton(ui.copyTranscribedBtn, ui.transcribedText);
});
