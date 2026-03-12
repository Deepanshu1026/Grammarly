import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

export default function ContentApp() {
    const [isEnabled, setIsEnabled] = useState(true);
    const [activeTarget, setActiveTarget] = useState<HTMLElement | null>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [proposedText, setProposedText] = useState<{ original: string; fixed: string } | null>(null);
    const [showPopover, setShowPopover] = useState(false);
    const checkTimeoutRef = useRef<number | null>(null);
    const widgetRef = useRef<HTMLDivElement>(null);

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
        } catch (e) {
            console.debug("Grammarly Clone context invalidated", e);
        }

        return () => {
            try {
                if (chrome.runtime?.id) {
                    chrome.storage?.onChanged?.removeListener(handleStorageChange);
                }
            } catch (e) {
                // Ignore context invalidated
            }
        };
    }, []);

    const updatePosition = () => {
        if (activeTarget) {
            const rect = activeTarget.getBoundingClientRect();
            // Since host is 'fixed', client rect matches perfectly without scroll offset
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
            // Need a tiny timeout to see where focus actually went
            setTimeout(() => {
                const shadowHost = document.getElementById('grammarly-clone-host');
                if (
                    document.activeElement !== activeTarget &&
                    document.activeElement !== shadowHost
                ) {
                    setActiveTarget(null);
                }
            }, 50);
        };

        const handleClickOutside = (e: MouseEvent) => {
            const isInsideWidget = widgetRef.current && e.composedPath().includes(widgetRef.current);
            const shadowHost = document.getElementById('grammarly-clone-host');

            if (e.target === activeTarget) {
                // Do nothing
            } else if (
                !isInsideWidget &&
                e.target !== activeTarget &&
                e.target !== shadowHost
            ) {
                // Keep active target if they just clicked somewhere else on the page but not an input
                // If they clicked something that isn't our target, clear it
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
                console.log("[Grammarly Clone] Context invalidated. Please refresh the page.");
                setStatus('idle');
                return;
            }

            setStatus('loading');
            chrome.runtime.sendMessage({ action: 'checkGrammar', text }, (response) => {
                if (chrome.runtime?.lastError) {
                    console.debug("[Grammarly Clone] Runtime Error (likely invalidated):", chrome.runtime.lastError.message);
                    setStatus('idle');
                    return;
                }

                console.log("[Grammarly Clone] Response received:", response);

                if (response && response.success) {
                    const resultMatches = response.data?.matches || [];
                    const hasErrors = resultMatches.length > 0;

                    if (hasErrors && activeTarget) {
                        // ... existing replacement logic ...
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
                                console.log("[Grammarly Clone] Showing popover with improvements");
                                setProposedText({ original: text, fixed: newText });
                                setShowPopover(true);
                                setStatus('error');
                            } else {
                                console.log("[Grammarly Clone] No significant improvements suggested");
                                setStatus('idle');
                            }
                        } else {
                            setStatus('idle');
                        }
                    } else {
                        console.log("[Grammarly Clone] No errors found in text");
                        setStatus('idle');
                    }
                } else {
                    console.error("[Grammarly Clone] API Error:", response?.error || "Unknown Error");
                    setStatus('idle');
                }
            });
        } catch (e) {
            console.debug("Grammarly Clone context invalidated", e);
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
                // Safe insertion: works for React Inputs by updating natively
                document.execCommand('insertText', false, replacementValue);

                // Fallback for some non-standard inputs just in case execCommand didn't work
                if (el.value.substring(startPos, startPos + replacementValue.length) !== replacementValue) {
                    const currentText = el.value;
                    const newText = currentText.substring(0, startPos) + replacementValue + currentText.substring(endPos);

                    // React 15/16/17 setter hack
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

                    if (activeTarget.tagName === 'INPUT' && nativeInputValueSetter) {
                        nativeInputValueSetter.call(el, newText);
                    } else if (activeTarget.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                        nativeTextAreaValueSetter.call(el, newText);
                    } else {
                        el.value = newText;
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            } else if (activeTarget.isContentEditable || activeTarget.contentEditable === 'true') {
                activeTarget.focus();

                // Select the text carefully inside the ContentEditable 
                // avoiding destroying framework DOMs (React, Vue, Facebook, WhatsApp web, etc.)
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    // Try our best to select the exact string index
                    const range = document.createRange();

                    // A proper implementation would traverse text nodes here to find the exact DOM node matches for match.context.offset.
                    // For simplicity and safety in a clone, we command 'selectAll' and replace if small, but let's just attempt 
                    // a basic select-and-replace algorithm via execCommand if possible, or gracefully degrade.
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

                            // Let the browser handle standard text replacing
                            document.execCommand('insertText', false, replacementValue);
                        } else {
                            // Fallback that might break React (only if tree walker fails)
                            const currentInner = activeTarget.innerText;
                            activeTarget.innerText = currentInner.substring(0, startPos) + replacementValue + currentInner.substring(endPos);
                            activeTarget.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    } catch (e) {
                        document.execCommand('insertText', false, replacementValue);
                    }
                }
            }
        } catch (e) {
            console.error("Grammarly Clone Error replacing text:", e);
        }

        // Re-check after a brief timeout to let React/site update the UI
        setTimeout(() => checkText(activeTarget), 50);
    };

    const getPopoverStyle = (): React.CSSProperties => {
        const style: React.CSSProperties = {};
        const popoverWidth = 260; // smaller popover
        const popoverMaxHeight = 200;
        const padding = 20;

        const spaceBelow = window.innerHeight - position.top - 38;
        const spaceAbove = position.top;
        const spaceLeft = position.left + 38;
        const spaceRight = window.innerWidth - position.left;

        if (spaceBelow > popoverMaxHeight + padding || spaceBelow > spaceAbove) {
            style.top = '52px';
            style.bottom = 'auto';
            style.maxHeight = Math.min(popoverMaxHeight, Math.max(spaceBelow - padding, 200)) + 'px';
        } else {
            style.bottom = '52px';
            style.top = 'auto';
            style.maxHeight = Math.min(popoverMaxHeight, Math.max(spaceAbove - padding, 200)) + 'px';
        }

        if (spaceLeft > popoverWidth + padding) {
            style.right = '0px';
            style.left = 'auto';
        } else if (spaceRight > popoverWidth + padding) {
            style.left = '0px';
            style.right = 'auto';
        } else {
            style.right = '0px';
            style.left = 'auto';
        }

        return style;
    };

    if (!isEnabled || !activeTarget) return null;

    return (
        <div
            ref={widgetRef}
            id="grammarly-clone-root"
            onMouseDown={(e) => {
                e.preventDefault();
            }}
            style={{ position: 'absolute', top: position.top, left: position.left }}
        >
            <button
                onClick={() => {
                    if (status === 'error') setShowPopover(!showPopover);
                }}
                className={`gc-widget-btn ${status === 'error' ? 'gc-widget-btn-error' : status === 'idle' ? 'gc-widget-btn-success' : ''}`}
            >
                {status === 'loading' && <Loader2 className="gc-icon-spin" />}
                {(status === 'error' || status === 'idle') && (
                    <img
                        src={chrome.runtime.getURL("logo/logo.png")}
                        alt="Grammarly Clone"
                        className="gc-logo-img"
                        style={{ filter: status === 'idle' ? 'grayscale(0) brightness(1)' : 'none' }}
                    />
                )}
            </button>

            {showPopover && (
                <div className="gc-popover" style={getPopoverStyle()}>
                    <div className="gc-popover-header">
                        <span className="gc-popover-title">AI Assistant</span>
                        <button onClick={() => setShowPopover(false)} className="gc-close-x">×</button>
                    </div>

                    <div className="gc-popover-body">
                        {status === 'error' && proposedText ? (
                            <div className="gc-suggestion-card">
                                <div className="gc-suggestion-label">Suggested Improvement:</div>
                                <div className="gc-suggestion-text">"{proposedText.fixed}"</div>
                                <button
                                    className="gc-replace-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        applyReplacement(0, proposedText.original.length, proposedText.fixed);
                                        setShowPopover(false);
                                    }}
                                >
                                    Apply Changes ✨
                                </button>
                            </div>
                        ) : (
                            <div className="gc-idle-state">
                                <p>No errors detected, but I can polish your text.</p>
                                <button
                                    className="gc-manual-refine-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (activeTarget) checkText(activeTarget);
                                    }}
                                >
                                    Force Refine / Polish ✨
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
