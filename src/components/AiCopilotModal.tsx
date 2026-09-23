import React, { useState } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { api, OrganizationInfo } from '../services/api.ts';

interface AiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTenant: OrganizationInfo | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const AiCopilotModal: React.FC<AiCopilotModalProps> = ({ isOpen, onClose, activeTenant }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I am your Industrial AI Copilot powered by Gemini. I have real-time access to telemetry, machine health, and manuals for **${activeTenant?.name || 'your facility'}**. How can I assist you with your operations today?`,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMsg, timestamp: new Date().toLocaleTimeString() },
    ]);

    setLoading(true);
    try {
      const data = await api.chatWithCopilot(userMsg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || 'No response received.',
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error connecting to AI Copilot: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    'What is the current health status of CNC-01?',
    'Explain the thermal alarm on Chiller #2',
    'Generate a root cause hypothesis for coolant flow starvation',
    'What preventive maintenance is due today?',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center space-x-2">
                <span>Industrial AI Copilot</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  Gemini 3.8 Flash
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Contextual Operations Assistant — {activeTenant?.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Prompts */}
        <div className="px-4 py-2 bg-zinc-900/30 border-b border-zinc-800 flex items-center space-x-2 overflow-x-auto">
          <span className="text-[10px] font-mono text-zinc-400 whitespace-nowrap">Suggested:</span>
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => setInput(prompt)}
              className="text-xs px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-500/50 hover:text-amber-300 transition whitespace-nowrap"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-amber-600 text-white rounded-br-none'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-none shadow-md'
                }`}
              >
                <div className="flex items-center justify-between mb-1 text-[10px] opacity-75">
                  <span className="font-semibold uppercase tracking-wider">
                    {m.role === 'user' ? 'Operator' : 'AI Copilot'}
                  </span>
                  <span className="font-mono">{m.timestamp}</span>
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-xl rounded-bl-none px-4 py-3 text-xs flex items-center space-x-2">
                <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span>Analyzing plant telemetry & reasoning engines...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about plant operations, machines, alarms, or give operational commands..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium text-xs flex items-center space-x-2 transition shadow-lg shadow-amber-900/20"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
