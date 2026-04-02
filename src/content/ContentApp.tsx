import { useState, useEffect, useRef } from 'react';
import { Loader2, Mic, MicOff } from 'lucide-react';

export default function ContentApp() {
    const [isEnabled, setIsEnabled] = useState(true);
    const [activeTarget, setActiveTarget] = useState<HTMLElement | null>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [proposedText, setProposedText] = useState<{ original: string; fixed: string } | null>(null);
    const [showPopover, setShowPopover] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const checkTimeoutRef = useRef<number | null>(null);
    const widgetRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        const handleStorageChange = (changes: any, namespace: string) => {
            if (namespace === 'sync' && changes.enabled) {
                setIsEnabled(changes.enabled.newValue);
                if (!changes.enabled.newValue) {
                    setActiveTarget(null);
                    setShowPopover(false);
                }
            }
        };

        try {
            if (!chrome.runtime?.id) throw new Error("Extension context invalidated");
            chrome.storage?.sync?.get(['enabled'], (result) => {
                if (chrome.runtime?.lastError) return;
                if (result.enabled !== undefined) setIsEnabled(result.enabled);
            });
            chrome.storage?.onChanged?.addListener(handleStorageChange);
        } catch (err) {
            console.debug("Grammarly Clone context invalidated", err);
        }

        return () => {
            try {
                if (chrome.runtime?.id) {
                    chrome.storage?.onChanged?.removeListener(handleStorageChange);
                }
            } catch (err) {
                // Ignore context
            }
        };
    }, []);

    const updatePosition = () => {
        if (activeTarget) {
            const rect = activeTarget.getBoundingClientRect();
            setPosition({
                top: rect.bottom - 45,
                left: rect.right - 45
            });
        }
    };

    useEffect(() => {
        window.addEventListener('resize', updatePosition);
        document.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            document.removeEventListener('scroll', updatePosition, true);
        };
    }, [activeTarget]);

    useEffect(() => {
        if (!isEnabled) return;

        const isEligibleInput = (el: HTMLElement) => {
            if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return false;
            if (el.tagName === 'TEXTAREA') return true;
            if (el.isContentEditable || el.contentEditable === 'true') return true;
            if (el.tagName === 'INPUT') {
                const type = (el as HTMLInputElement).type.toLowerCase();
                return ['text', 'search', 'email', 'url', 'password', 'tel'].includes(type);
            }
            return false;
        };

        const handleFocusIn = (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (isEligibleInput(target)) {
                setActiveTarget(target);
                setTimeout(() => updatePosition(), 10);
                checkText(target);
            }
        };

        const handleInput = (e: Event) => {
            if (e.target === activeTarget) {
                updatePosition();
                if (checkTimeoutRef.current) window.clearTimeout(checkTimeoutRef.current);
                setStatus('loading');
                setShowPopover(false);
                checkTimeoutRef.current = window.setTimeout(() => {
                    if (activeTarget) checkText(activeTarget);
                }, 1000);
            }
        };

        const handleBlur = () => {
            setTimeout(() => {
                const shadowHost = document.getElementById('grammarly-clone-host');
                if (document.activeElement !== activeTarget && document.activeElement !== shadowHost) {
                    setActiveTarget(null);
                }
            }, 50);
        };

        const handleClickOutside = (e: MouseEvent) => {
            const isInsideWidget = widgetRef.current && e.composedPath().includes(widgetRef.current);
            const shadowHost = document.getElementById('grammarly-clone-host');
            if (e.target !== activeTarget && !isInsideWidget && e.target !== shadowHost) {
                if (!(e.target instanceof HTMLElement && isEligibleInput(e.target))) {
                    setActiveTarget(null);
                }
            }
        };

        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('input', handleInput);
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('focusout', handleBlur);

        return () => {
            document.removeEventListener('focusin', handleFocusIn);
            document.removeEventListener('input', handleInput);
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('focusout', handleBlur);
        };
    }, [isEnabled, activeTarget]);

    const checkText = (element: HTMLElement) => {
        let text = "";
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            text = (element as HTMLInputElement | HTMLTextAreaElement).value;
        } else if (element.isContentEditable || element.contentEditable === 'true') {
            text = element.innerText || element.textContent || "";
        }

        if (!text || text.trim() === '') {
            setStatus('idle');
            return;
        }

        try {
            if (!chrome.runtime?.id) {
                setStatus('idle');
                return;
            }

            setStatus('loading');
            chrome.runtime.sendMessage({ action: 'checkGrammar', text }, (response) => {
                if (chrome.runtime?.lastError) {
                    setStatus('idle');
                    return;
                }

                if (response && response.success) {
                    const resultMatches = response.data?.matches || [];
                    if (resultMatches.length > 0 && activeTarget) {
                        let activeText = "";
                        if (activeTarget.tagName === 'INPUT' || activeTarget.tagName === 'TEXTAREA') {
                            activeText = (activeTarget as HTMLInputElement | HTMLTextAreaElement).value;
                        } else if (activeTarget.isContentEditable || activeTarget.contentEditable === 'true') {
                            activeText = activeTarget.innerText || activeTarget.textContent || "";
                        }

                        if (activeText === text) {
                            let newText = text;
                            const filteredMatches = [];
                            let lastEnd = text.length + 1;
                            for (const match of [...resultMatches].reverse()) {
                                if (match.offset + match.length <= lastEnd) {
                                    filteredMatches.push(match);
                                    lastEnd = match.offset;
                                }
                            }
                            let hasReplacement = false;
                            for (const match of filteredMatches) {
                                const repValue = match.replacements?.length > 0 ? match.replacements[0].value : null;
                                if (repValue && !repValue.includes("Consider rewriting")) {
                                    newText = newText.substring(0, match.offset) + repValue + newText.substring(match.offset + match.length);
                                    hasReplacement = true;
                                }
                            }

                            if (hasReplacement && newText !== text) {
                                setProposedText({ original: text, fixed: newText });
                                setStatus('error');
                            } else {
                                setProposedText(null);
                                setStatus('idle');
                            }
                        } else {
                            setStatus('idle');
                        }
                    } else {
                        setProposedText(null);
                        setStatus('idle');
                    }
                } else {
                    setStatus('idle');
                }
            });
        } catch (err) {
            setStatus('idle');
        }
    };

    const applyReplacement = (startPos: number, endPos: number, replacementValue: string) => {
        if (!activeTarget) return;
        setStatus('loading');

        try {
            if (activeTarget.tagName === 'INPUT' || activeTarget.tagName === 'TEXTAREA') {
                const el = activeTarget as HTMLInputElement | HTMLTextAreaElement;
                el.focus();
                el.setSelectionRange(startPos, endPos);
                document.execCommand('insertText', false, replacementValue);
            } else if (activeTarget.isContentEditable || activeTarget.contentEditable === 'true') {
                activeTarget.focus();
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = document.createRange();
                    try {
                        let currentOffset = 0;
                        let startNode: Node | null = null;
                        let startNodeOffset = 0;
                        let endNode: Node | null = null;
                        let endNodeOffset = 0;

                        const walkNodes = (node: Node) => {
                            if (startNode && endNode) return;
                            if (node.nodeType === Node.TEXT_NODE) {
                                const len = node.nodeValue?.length || 0;
                                if (!startNode && currentOffset + len >= startPos) {
                                    startNode = node;
                                    startNodeOffset = startPos - currentOffset;
                                }
                                if (startNode && !endNode && currentOffset + len >= endPos) {
                                    endNode = node;
                                    endNodeOffset = endPos - currentOffset;
                                }
                                currentOffset += len;
                            } else {
                                for (let i = 0; i < node.childNodes.length; i++) {
                                    walkNodes(node.childNodes[i]);
                                }
                            }
                        };
                        walkNodes(activeTarget);

                        if (startNode && endNode) {
                            range.setStart(startNode, startNodeOffset);
                            range.setEnd(endNode, endNodeOffset);
                            selection.removeAllRanges();
                            selection.addRange(range);
                            document.execCommand('insertText', false, replacementValue);
                        } else {
                            activeTarget.innerText = activeTarget.innerText.substring(0, startPos) + replacementValue + activeTarget.innerText.substring(endPos);
                        }
                    } catch (err) {
                        document.execCommand('insertText', false, replacementValue);
                    }
                }
            }
        } catch (err) {
            console.error("Replacement Error:", err);
        }

        setProposedText(null);
        setStatus('idle');
        setShowPopover(false);
        setTimeout(() => { if (activeTarget) checkText(activeTarget); }, 300);
    };

    const toggleRecording = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser.");
            return;
        }

        if (!recognitionRef.current) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript && activeTarget) {
                    insertTextAtCursor(finalTranscript);
                }
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                setIsRecording(false);
            };

            recognition.onend = () => {
                setIsRecording(false);
            };

            recognitionRef.current = recognition;
        }

        try {
            recognitionRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Failed to start recognition:", err);
            setIsRecording(false);
        }
    };

    const insertTextAtCursor = (text: string) => {
        if (!activeTarget) return;

        try {
            if (activeTarget.tagName === 'INPUT' || activeTarget.tagName === 'TEXTAREA') {
                const el = activeTarget as HTMLInputElement | HTMLTextAreaElement;
                const start = el.selectionStart || 0;
                const end = el.selectionEnd || 0;
                const val = el.value;
                el.value = val.substring(0, start) + text + val.substring(end);
                el.selectionStart = el.selectionEnd = start + text.length;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (activeTarget.isContentEditable || activeTarget.contentEditable === 'true') {
                activeTarget.focus();
                document.execCommand('insertText', false, text);
            }
        } catch (err) {
            console.error("Insert Text Error:", err);
        }
    };

    const getPopoverStyle = (): React.CSSProperties => {
        const style: React.CSSProperties = {};
        const popoverMaxHeight = 300;
        const padding = 20;
        const spaceBelow = window.innerHeight - position.top - 38;
        const spaceAbove = position.top;

        if (spaceBelow > popoverMaxHeight + padding || spaceBelow > spaceAbove) {
            style.top = '52px';
            style.bottom = 'auto';
        } else {
            style.bottom = '52px';
            style.top = 'auto';
        }
        style.right = '0px';
        style.left = 'auto';
        return style;
    };

    if (!isEnabled || !activeTarget) return null;

    return (
        <div ref={widgetRef} id="grammarly-clone-root" onMouseDown={(e) => e.preventDefault()} style={{ position: 'absolute', top: position.top, left: position.left, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
                onClick={() => { if (status === 'error') setShowPopover(!showPopover); }}
                className={`gc-widget-btn ${status === 'error' ? 'gc-widget-btn-error' : 'gc-widget-btn-success'}`}
            >
                {status === 'loading' ? <Loader2 className="gc-icon-spin" /> : <img src={chrome.runtime.getURL("logo/logo.png")} alt="Logo" className="gc-logo-img" />}
            </button>

            <button
                onClick={(e) => { e.stopPropagation(); toggleRecording(); }}
                className={`gc-widget-btn ${isRecording ? 'gc-mic-active' : ''}`}
                style={{ width: '34px', height: '34px' }}
                title="Voice Typing"
            >
                {isRecording ? <MicOff size={18} className="text-red-500" /> : <Mic size={18} />}
            </button>

            {showPopover && (
                <div className="gc-popover" style={getPopoverStyle()}>
                    <div className="gc-popover-header">
                        <span className="gc-popover-title">AI Editor</span>
                        <button onClick={() => setShowPopover(false)} className="gc-close-x">×</button>
                    </div>
                    <div className="gc-popover-body">
                        {status === 'error' && proposedText ? (
                            <div className="gc-suggestion-card">
                                <div className="gc-suggestion-label">Suggested Improvement:</div>
                                <div className="gc-suggestion-text">"{proposedText.fixed}"</div>
                                <button className="gc-replace-btn" onClick={(ev) => { ev.stopPropagation(); applyReplacement(0, proposedText.original.length, proposedText.fixed); }}>Apply Changes ✨</button>
                            </div>
                        ) : (
                            <div className="gc-idle-state">
                                <p>No errors detected, but I can polish your text.</p>
                                <button className="gc-manual-refine-btn" onClick={(ev) => { ev.stopPropagation(); if (activeTarget) checkText(activeTarget); }}>Force Refine / Polish ✨</button>
                                <div style={{ marginTop: '12px', borderTop: '1px solid #eee', paddingTop: '12px' }}>
                                    <button
                                        className={`gc-manual-refine-btn ${isRecording ? 'gc-mic-active' : ''}`}
                                        onClick={(ev) => { ev.stopPropagation(); toggleRecording(); }}
                                        style={{ backgroundColor: isRecording ? '#fee2e2' : 'white' }}
                                    >
                                        {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                                        {isRecording ? 'Stop Recording' : 'Start Voice Typing'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
