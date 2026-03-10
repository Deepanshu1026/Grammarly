import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

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
        chrome.storage?.sync?.get(['enabled'], (result) => {
            if (result.enabled !== undefined) setIsEnabled(result.enabled);
        });

        const handleStorageChange = (changes: any, namespace: string) => {
            if (namespace === 'sync' && changes.enabled) {
                setIsEnabled(changes.enabled.newValue);
                if (!changes.enabled.newValue) {
                    setActiveTarget(null);
                    setShowPopover(false);
                }
            }
        };

        chrome.storage?.onChanged?.addListener(handleStorageChange);
        return () => chrome.storage?.onChanged?.removeListener(handleStorageChange);
    }, []);

    const updatePosition = () => {
        if (activeTarget) {
            const rect = activeTarget.getBoundingClientRect();
            setPosition({
                top: rect.bottom + window.scrollY - 35,
                left: rect.right + window.scrollX - 40
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
                if (
                    document.activeElement !== activeTarget &&
                    !widgetRef.current?.contains(document.activeElement)
                ) {
                    setActiveTarget(null);
                    setShowPopover(false);
                }
            }, 50);
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (
                widgetRef.current &&
                !widgetRef.current.contains(e.target as Node) &&
                e.target !== activeTarget
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

        setStatus('loading');
        chrome.runtime?.sendMessage({ action: 'checkGrammar', text }, (response) => {
            if (response && response.success) {
                const resultMatches = response.data.matches;
                setMatches(resultMatches);
                setStatus(resultMatches.length > 0 ? 'error' : 'idle');
            } else {
                setStatus('idle');
            }
        });
    };

    if (!isEnabled || !activeTarget) return null;

    return (
        <div
            ref={widgetRef}
            style={{ position: 'absolute', top: position.top, left: position.left, zIndex: 2147483647 }}
            className="font-sans antialiased text-left"
        >
            <button
                onClick={() => matches.length > 0 && setShowPopover(!showPopover)}
                className="w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center relative hover:scale-105 transition-transform"
            >
                {status === 'loading' && <Loader2 className="w-4 h-4 text-green-500 animate-spin" />}
                {status === 'idle' && <CheckCircle className="w-5 h-5 text-green-500" />}
                {status === 'error' && (
                    <>
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Grammarly_logo.svg/1024px-Grammarly_logo.svg.png" className="w-5 h-5 opacity-90 object-contain" alt="G" style={{ filter: 'grayscale(100%) sepia(100%) hue-rotate(300deg) saturate(10000%)' }} />
                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-[4px] py-[1px] rounded-full shadow-sm">
                            {matches.length > 99 ? '99+' : matches.length}
                        </div>
                    </>
                )}
            </button>

            {showPopover && matches.length > 0 && (
                <div className="absolute top-10 right-0 w-80 bg-white rounded-xl shadow-xl border border-gray-100 flex flex-col max-h-[400px] overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 font-semibold text-gray-800 flex justify-between items-center">
                        <span>Suggestions</span>
                        <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">{matches.length}</span>
                    </div>

                    <div className="overflow-y-auto w-full">
                        {matches.map((match, idx) => {
                            const start = match.context.text.substring(0, match.context.offset);
                            const errorWord = match.context.text.substring(match.context.offset, match.context.offset + match.context.length);
                            const end = match.context.text.substring(match.context.offset + match.context.length);

                            return (
                                <div key={idx} className="p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                    <p className="text-sm font-semibold text-red-500 mb-2 flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                        {match.message}
                                    </p>

                                    <div className="text-xs text-gray-600 bg-gray-100 rounded p-2 mb-3 leading-relaxed">
                                        ...{start}<span className="bg-red-200 text-red-900 px-0.5 rounded underline decoration-red-500 decoration-wavy">{errorWord}</span>{end}...
                                    </div>

                                    {match.replacements.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {match.replacements.slice(0, 3).map((r, i) => (
                                                <button key={i} className="px-3 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-md text-sm font-medium transition-colors">
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
