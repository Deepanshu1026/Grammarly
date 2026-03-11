import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface Match {
    message: string;
    context: { text: string; offset: number; length: number };
    replacements: { value: string }[];
}

export default function ContentApp() {
    const [isEnabled, setIsEnabled] = useState(true);
    const [activeTarget, setActiveTarget] = useState<HTMLElement | null>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [matches, setMatches] = useState<Match[]>([]);
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
                    setShowPopover(false);
                }
            }, 50);
        };

        const handleClickOutside = (e: MouseEvent) => {
            const isInsideWidget = widgetRef.current && e.composedPath().includes(widgetRef.current);
            const shadowHost = document.getElementById('grammarly-clone-host');

            if (
                !isInsideWidget &&
                e.target !== activeTarget &&
                e.target !== shadowHost
            ) {
                // Keep active target if they just clicked somewhere else on the page but not an input
                setShowPopover(false);

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
            setMatches([]);
            return;
        }

        try {
            if (!chrome.runtime?.id) throw new Error("Extension context invalidated");

            setStatus('loading');
            chrome.runtime?.sendMessage({ action: 'checkGrammar', text }, (response) => {
                if (chrome.runtime?.lastError) {
                    console.debug("Grammarly Clone checkGrammar error:", chrome.runtime.lastError);
                    setStatus('idle');
                    return;
                }
                if (response && response.success) {
                    const resultMatches = response.data?.matches || [];
                    setMatches(resultMatches);
                    setStatus(resultMatches.length > 0 ? 'error' : 'idle');
                } else {
                    setStatus('idle');
                }
            });
        } catch (e) {
            console.debug("Grammarly Clone context invalidated", e);
            setStatus('idle');
        }
    };

    const applyReplacement = (match: Match, replacementValue: string) => {
        if (!activeTarget) return;

        setStatus('loading');

        try {
            if (activeTarget.tagName === 'INPUT' || activeTarget.tagName === 'TEXTAREA') {
                const el = activeTarget as HTMLInputElement | HTMLTextAreaElement;

                // Keep track of the original cursor position
                const startPos = match.context.offset;
                const endPos = match.context.offset + match.context.length;

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
                                if (!startNode && currentOffset + len >= match.context.offset) {
                                    startNode = node;
                                    startNodeOffset = match.context.offset - currentOffset;
                                }
                                if (startNode && !endNode && currentOffset + len >= match.context.offset + match.context.length) {
                                    endNode = node;
                                    endNodeOffset = match.context.offset + match.context.length - currentOffset;
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
                            activeTarget.innerText = activeTarget.innerText.replace(match.context.text.substring(match.context.offset, match.context.offset + match.context.length), replacementValue);
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
        const popoverWidth = 360;
        const popoverMaxHeight = 480;
        const padding = 20;

        const spaceBelow = window.innerHeight - position.top - 38;
        const spaceAbove = position.top;
        const spaceLeft = position.left + 38;
        const spaceRight = window.innerWidth - position.left;

        // Vertical placement: default to below to avoid overlapping text
        if (spaceBelow > popoverMaxHeight + padding || spaceBelow > spaceAbove) {
            style.top = '52px';
            style.bottom = 'auto';
            style.maxHeight = Math.min(popoverMaxHeight, Math.max(spaceBelow - padding, 200)) + 'px';
        } else {
            style.bottom = '52px';
            style.top = 'auto';
            style.maxHeight = Math.min(popoverMaxHeight, Math.max(spaceAbove - padding, 200)) + 'px';
        }

        // Horizontal placement: ensure it stays on screen
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

    if (!isEnabled || !activeTarget || status === 'idle') return null;

    return (
        <div
            ref={widgetRef}
            id="grammarly-clone-root"
            onMouseDown={(e) => {
                // CRITICAL FIX: Prevent focus stealing
                e.preventDefault();
            }}
            style={{ position: 'absolute', top: position.top, left: position.left }}
        >
            <button
                onClick={() => matches.length > 0 && setShowPopover(!showPopover)}
                className={`gc-widget-btn ${status === 'error' ? 'gc-widget-btn-error' : ''}`}
            >
                {status === 'loading' && <Loader2 className="gc-icon-spin" />}
                {status === 'error' && (
                    <>
                        <img
                            src={chrome.runtime.getURL("logo/Grammerly logo.png")}
                            alt="Grammarly Clone Error"
                            className="gc-logo-img"
                        />
                        <div className="gc-badge">
                            {matches.length > 99 ? '99+' : matches.length}
                        </div>
                    </>
                )}
            </button>

            {showPopover && matches.length > 0 && (
                <div className="gc-popover" style={getPopoverStyle()}>
                    <div className="gc-popover-header">
                        <span className="gc-popover-title">Suggestions</span>
                        <div className="gc-popover-count-pill">{matches.length}</div>
                    </div>

                    <div className="gc-popover-body">
                        {matches.map((match, idx) => {
                            const start = match.context.text.substring(0, match.context.offset);
                            const errorWord = match.context.text.substring(match.context.offset, match.context.offset + match.context.length);
                            const end = match.context.text.substring(match.context.offset + match.context.length);

                            return (
                                <div key={idx} className="gc-match-card">
                                    <div className="gc-match-header">
                                        <div className="gc-icon-wrapper">
                                            <AlertCircle className="gc-match-icon" />
                                        </div>
                                        <span className="gc-match-title">{match.message}</span>
                                    </div>

                                    <div className="gc-match-context">
                                        ...{start}<span className="gc-error-word">{errorWord}</span>{end}...
                                    </div>

                                    {match.replacements.length > 0 && (
                                        <div className="gc-replacements">
                                            {match.replacements.slice(0, 3).map((r, i) => (
                                                <button
                                                    key={i}
                                                    className="gc-replace-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        applyReplacement(match, r.value);
                                                    }}
                                                >
                                                    {r.value}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
