'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { MessageSquare, Sparkles, Send, Bot, User, X } from 'lucide-react';
import type { MonthlySpending } from '@/lib/data';
import {
  getInsightsAction,
  analyzeSpendingAction,
  AIState,
} from '@/app/actions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { marked } from 'marked';
import { Separator } from '../ui/separator';

type Props = {
  financialData: MonthlySpending;
};

const suggestedPrompts = [
  'Why is my spending up this month?',
  'Give me some saving tips for my top categories.',
  'Summarize my financial health.',
];

const hasServerGeminiKey =
  process.env.NEXT_PUBLIC_HAS_GEMINI_KEY === 'true';

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query, matches]);

  return matches;
}

type ChatPanelProps = {
  messages: AIState[];
  isLoading: boolean;
  inputValue: string;
  setInputValue: (val: string) => void;
  onPrompt: (prompt: string, isAnalysis?: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  scrollAreaRef: React.RefObject<HTMLDivElement>;
};

function ChatPanel({
  messages,
  isLoading,
  inputValue,
  setInputValue,
  onPrompt,
  onSubmit,
  onClose,
  scrollAreaRef,
}: ChatPanelProps) {
  const renderMessageContent = (content: string) => {
    const sanitizedHtml = marked.parse(content, { gfm: true, breaks: true });
    return { __html: sanitizedHtml as string };
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <p className="text-sm font-medium">AI Financial Assistant</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <Separator />

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <div className="space-y-6 p-6">
          {messages.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bot className="mx-auto mb-4 h-10 w-10" />
              <p>
                I&apos;m ready to help you with your financial questions. Try
                one of the suggestions below!
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                'flex items-start gap-3',
                message.role === 'user' && 'justify-end'
              )}
            >
              {message.role !== 'user' && (
                <Avatar className="h-8 w-8 border">
                  <AvatarFallback>
                    <Bot size={16} />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={cn(
                  'prose prose-sm max-w-none max-w-[85%] rounded-lg p-3 text-sm prose-p:my-0 prose-ul:my-0 prose-li:my-0',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted',
                  message.role === 'error' &&
                    'border border-destructive/20 bg-destructive/10 text-destructive'
                )}
                dangerouslySetInnerHTML={renderMessageContent(
                  message.content
                )}
              />
              {message.role === 'user' && (
                <Avatar className="h-8 w-8 border">
                  <AvatarFallback>
                    <User size={16} />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8 border">
                <AvatarFallback>
                  <Bot size={16} />
                </AvatarFallback>
              </Avatar>
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-foreground" />
                  <div className="h-2 w-2 animate-pulse rounded-full bg-foreground delay-150" />
                  <div className="h-2 w-2 animate-pulse rounded-full bg-foreground delay-300" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Input + suggestions */}
      <div className="flex flex-col gap-2 p-4">
        {messages.length === 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPrompt('Analyze my spending', true)}
              disabled={isLoading}
            >
              Analyze my spending
            </Button>
            {suggestedPrompts.map(p => (
              <Button
                key={p}
                variant="outline"
                size="sm"
                onClick={() => onPrompt(p)}
                disabled={isLoading}
              >
                {p}
              </Button>
            ))}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="flex w-full items-center gap-2"
        >
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !inputValue.trim()}
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AiAssistant({ financialData }: Props) {
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<AIState[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const [userGeminiKey, setUserGeminiKey] = useState<string | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.sessionStorage.getItem('userGeminiApiKey');
    if (stored) {
      setUserGeminiKey(stored);
    }
  }, []);

  useEffect(() => {
    if (isOpen && scrollAreaRef.current) {
      setTimeout(() => {
        const viewport = scrollAreaRef.current?.querySelector(
          '[data-radix-scroll-area-viewport]'
        );
        if (viewport) {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: 'smooth',
          });
        }
      }, 100);
    }
  }, [messages, isLoading, isOpen]);

  const handleVerifyAndSaveKey = async () => {
    setKeyError(null);
    const trimmed = keyInput.trim();

    if (!trimmed) {
      setKeyError('Please enter your Gemini API key.');
      return;
    }

    setIsVerifyingKey(true);
    try {
      const res = await fetch('/api/verify-gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      if (!res.ok) {
        let msg = 'Could not verify API key.';
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
        }
        setKeyError(msg);
        return;
      }

      setUserGeminiKey(trimmed);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('userGeminiApiKey', trimmed);
      }
      setShowKeySetup(false);
      setIsOpen(true);
    } catch (err) {
      setKeyError('Network error while verifying the key. Please try again.');
    } finally {
      setIsVerifyingKey(false);
    }
  };

  const handlePrompt = async (prompt: string, isAnalysis: boolean = false) => {
    if (isLoading) return;

    if (!hasServerGeminiKey && !userGeminiKey) {
      setShowKeySetup(true);
      return;
    }

    setIsLoading(true);

    const userMessage: AIState = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    const apiKeyForThisCall = hasServerGeminiKey ? undefined : userGeminiKey ?? undefined;

    let response: AIState;
    if (isAnalysis) {
      response = await analyzeSpendingAction(financialData, apiKeyForThisCall);
    } else {
      response = await getInsightsAction(prompt, financialData, apiKeyForThisCall);
    }

    setMessages(prev => [...prev, response]);
    setIsLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      handlePrompt(inputValue.trim());
    }
  };

  const handleOpenAssistant = () => {
    if (!hasServerGeminiKey && !userGeminiKey) {
      setShowKeySetup(true);
    } else {
      setIsOpen(true);
    }
  };

  const handleCloseAssistant = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Floating trigger button */}
      <Button
        size="icon"
        className={cn(
          'fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg transition-opacity duration-300 z-40',
          isOpen && 'opacity-0'
        )}
        onClick={handleOpenAssistant}
      >
        <MessageSquare className="h-6 w-6" />
        <span className="sr-only">Toggle AI Assistant</span>
      </Button>

      {/* Desktop popover */}
      <Popover
        open={isDesktop && isOpen}
        onOpenChange={open => {
          if (isDesktop) setIsOpen(open);
        }}
      >
        <PopoverTrigger asChild>
          {/* Invisible anchor for Popover on desktop */}
          <button className="hidden sm:block fixed bottom-6 right-6 h-0 w-0" />
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="end"
          sideOffset={16}
          className="hidden sm:block p-0 w-[440px] max-h-[700px] mr-2 rounded-lg border bg-background shadow-lg"
        >
          <div className="h-[520px] max-h-[700px]">
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              inputValue={inputValue}
              setInputValue={setInputValue}
              onPrompt={handlePrompt}
              onSubmit={handleSubmit}
              onClose={handleCloseAssistant}
              scrollAreaRef={scrollAreaRef}
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Mobile full-screen */}
      {isOpen && !isDesktop && (
        <div className="fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col bg-background">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            inputValue={inputValue}
            setInputValue={setInputValue}
            onPrompt={handlePrompt}
            onSubmit={handleSubmit}
            onClose={handleCloseAssistant}
            scrollAreaRef={scrollAreaRef}
          />
        </div>
      )}

      {/* Gemini API key setup overlay (when server key is missing) */}
      {showKeySetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-semibold">
                  Connect Gemini API
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowKeySetup(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              To use the AI assistant, please provide a{' '}
              <span className="font-medium">Gemini API key</span>. This key is
              only used in your browser session and not stored on our servers.
            </p>

            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="mb-3 inline-flex text-xs text-primary underline underline-offset-2"
            >
              Get a Gemini API key
            </a>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Gemini API key
              </label>
              <Input
                placeholder="Paste your Gemini API key..."
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                disabled={isVerifyingKey}
              />
              {keyError && (
                <p className="text-xs text-destructive">{keyError}</p>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKeySetup(false)}
                disabled={isVerifyingKey}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleVerifyAndSaveKey}
                disabled={isVerifyingKey || !keyInput.trim()}
              >
                {isVerifyingKey ? 'Verifying…' : 'Verify & Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
