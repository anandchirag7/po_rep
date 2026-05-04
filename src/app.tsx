import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, Database, Loader2, Check, Copy, Sparkles, MessageSquare, TerminalSquare, Trash2 } from 'lucide-react';
import remarkGfm from 'remark-gfm';
import { useChatHistory, Message } from './hooks/useChatHistory';
import sqlTemplates from './metadata/Sql_template_registry.json';
import businessRules from './metadata/Business_rules.txt?raw';
import viewColumnsMap from './metadata/view_columns_map.csv?raw';
import metadataJoins from './metadata/metadata_joins.csv?raw';
import calculatedColumns from './metadata/calculated_columns.csv?raw';
import teradataIssues from './metadata/teradata_issues.csv?raw';
import { validateTeradataSQL } from './utils/teradataValidator';
import { generateSummary } from './utils/summaryAgent';

const BASE_SYSTEM_INSTRUCTION = `You are an expert Procurement Data Analyst and Teradata SQL Developer agent.
Your task is to translate user questions into Teradata SQL queries based on a specific repository of core procurement queries.

### BUSINESS RULES & DOMAIN KNOWLEDGE
${businessRules}

### SCHEMA & COLUMNS MAP
${viewColumnsMap}

### TABLE JOINS MAP
${metadataJoins}

### CALCULATED COLUMNS LOGIC
${calculatedColumns}

### RULES
1. **Context Awareness:** Maintain conversation context. If a user asks a follow-up, modify the previous query.
2. **Missing Parameters:** Before generating ANY SQL, verify if you have all required parameters. You already have Cost Center, UID, and Source System from the Current Context provided. If any OTHER parameters (e.g. Date Range, Material ID, PO Number) are missing for the specific template, DO NOT write a SQL query yet. Instead, politely ask the user to provide the missing information.
3. **Wait for Clarification:** Only generate the SQL when you have received all the required parameters from the user to substitute into the query.
4. **SQL Generation:** Use standard Teradata syntax. Wrap in \`\`\`sql ... \`\`\` blocks. Replace placeholders (like \`@CostCenterNumber\`, \`@FromDate\`, \`@ToDate\`) with the ACTUAL values provided by the user or the Current Context. Do NOT output raw placeholders in your final SQL.
5. **Ground Truth:** ALWAYS prioritize the join logic and column aliases found in the REFERENCE SQL TEMPLATES provided below.`;

const TEMPLATE_CONTEXT = sqlTemplates.templates
  .map((t: any) => {
    return `### Template: ${t.template_id} (${t.intent})\nDescription: ${t.description}\nSQL:\n${t.sql}\n`;
  })
  .join('\n');

const SYSTEM_INSTRUCTION = `${BASE_SYSTEM_INSTRUCTION}\n\n### REFERENCE SQL TEMPLATES (GROUND TRUTH)\n${TEMPLATE_CONTEXT}`;

const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const isCodeBlock = !inline && match;

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isCodeBlock) {
    return (
      <div className="relative rounded-lg bg-slate-900 my-4 overflow-hidden border border-slate-700 shadow-md">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <TerminalSquare size={14} className="text-slate-400" />
            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider">{match[1]}</span>
          </div>
          <button
            onClick={handleCopy}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-md hover:bg-slate-700"
            title="Copy code"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
        <div className="p-4 overflow-x-auto text-sm font-mono text-slate-50 leading-relaxed">
          <code className={className} {...props}>
            {children}
          </code>
        </div>
      </div>
    );
  }

  return (
    <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono border border-slate-200" {...props}>
      {children}
    </code>
  );
};

export default function App() {
  const { messages, setMessages, history, currentChatId, startNewChat, loadChat, deleteChat } = useChatHistory({
    id: '1',
    role: 'model',
    text: 'Hello! I am your Procurement SQL Agent. I have been updated with your specific query repository for Cost Centers, Purchase Orders, Suppliers, and Invoices. How can I assist you with your procurement data today?',
  });

  const [currentUser, setCurrentUser] = useState({
    userId: 'Loading...',
    costCenter: 'Loading...',
    sourceSystem: 'SBI-NBP'
  });

  // Mock a backend fetch for the current user
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentUser({
        userId: 'chiragan',
        costCenter: '58588',
        sourceSystem: 'SBI-NBP'
      });
    }, 1000); // Simulate 1 second network delay
    return () => clearTimeout(timer);
  }, []);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };



  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const dynamicSystemPrompt = `${SYSTEM_INSTRUCTION}

### CURRENT CONTEXT (DEFAULT PARAMETERS)
The following parameters are constant for this user session. Do NOT ask the user for these values. Use them automatically to replace placeholders in the SQL query:
- @CostCenterNumber = ${currentUser.costCenter}
- @UID = ${currentUser.userId}
- @UNAME = ${currentUser.userId}
- @SourceSystem = ${currentUser.sourceSystem}
`;

      const apiMessages = [
        { role: 'system', content: dynamicSystemPrompt },
        ...messages.slice(1).map(m => ({ // Skip the first welcome message
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.text
        })),
        { role: 'user', content: userMessage.text }
      ];

      const payload = {
        model: 'gpt-oss:120b-cloud',
        messages: apiMessages,
        stream: false,
        options: {
          temperature: 0.7
        }
      };

      const modelMessageId = (Date.now() + 1).toString();
      // Add a placeholder message while waiting
      setMessages((prev) => [
        ...prev,
        { id: modelMessageId, role: 'model', text: 'Processing...' },
      ]);

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      let content = data.message?.content || "";

      // Teradata SQL Validation & LLM Self-Correction Loop
      const sqlMatch = content.match(/```sql\n([\s\S]*?)```/i);
      if (sqlMatch) {
        const sql = sqlMatch[1];
        const validationError = validateTeradataSQL(sql);

        if (validationError) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === modelMessageId ? { ...msg, text: 'Teradata syntax error detected. Correcting SQL...' } : msg
            )
          );

          const correctionMessages = [
            ...apiMessages,
            { role: 'assistant', content: content },
            { role: 'user', content: `The SQL you generated contains a Teradata syntax error: ${validationError}\n\nPlease correct the SQL using proper Teradata syntax. You can use the following Teradata Syntax Troubleshooting Guide to find the correct translation for your issue:\n\n${teradataIssues}\n\nReturn the corrected SQL wrapped in \`\`\`sql ... \`\`\` blocks.` }
          ];

          const correctionPayload = {
            model: 'gpt-oss:120b-cloud',
            messages: correctionMessages,
            stream: false,
            options: {
              temperature: 0.3
            }
          };

          try {
            const correctionResponse = await fetch('http://localhost:11434/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(correctionPayload)
            });

            if (correctionResponse.ok) {
              const correctionData = await correctionResponse.json();
              content = correctionData.message?.content || content;
            }
          } catch (e) {
            console.error('Correction loop failed:', e);
          }
        }
      }

      let finalContent = content;

      // Pipeline Step 2: Execution & Summary (if SQL was generated)
      const finalSqlMatch = content.match(/```sql\n([\s\S]*?)```/i);
      if (finalSqlMatch) {
        const sql = finalSqlMatch[1];
        
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === modelMessageId ? { ...msg, text: 'Executing query and analyzing results...' } : msg
          )
        );

        // 1. Generate Summary (includes mock execution)
        const insights = await generateSummary(sql, userMessage.text);

        if (insights) {
          // 2. Format output: Insights -> SQL -> Explanation
          const explanation = content.replace(/```sql\n[\s\S]*?```/i, '').trim();
          finalContent = `### Business Insights\n${insights}\n\n### Query\n\`\`\`sql\n${sql}\n\`\`\`\n\n${explanation}`;
        }
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === modelMessageId ? { ...msg, text: finalContent } : msg
        )
      );
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: 'I apologize, but I am unable to process your request at the moment due to an internal error.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const SUGGESTIONS = [
    "Show me late POs for cost center 12345.",
    "Get unreleased requisitions for my UID.",
    "List all open POs for cost center 67890 between Jan and March.",
    "Show invoice summary for PO 4500123456.",
    "Check supplier blocks for supplier ID 998877."
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <div className="w-80 bg-slate-900 text-slate-50 flex flex-col border-r border-slate-800 shadow-xl z-10 hidden md:flex">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Database size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Procurement SQL</h1>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Agentic Teradata SQL generator for 25+ procurement tables and views.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Coverage Areas</h2>
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Purchase Orders & Cost Centers</li>
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> PO Line Items</li>
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Purchase Requisitions</li>
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Invoices & Payments</li>
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Supplier Details</li>
            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Shopping Carts</li>
          </ul>

          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-8 mb-4">Current Context</h2>
          <div className="space-y-3 mb-8">
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1">Cost Center</label>
              <input type="text" disabled value={currentUser.costCenter} className="w-full bg-slate-800/50 text-slate-400 border border-slate-700/50 rounded-md p-2 text-xs cursor-not-allowed" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1">User ID</label>
              <input type="text" disabled value={currentUser.userId} className="w-full bg-slate-800/50 text-slate-400 border border-slate-700/50 rounded-md p-2 text-xs cursor-not-allowed" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1">Source System</label>
              <input type="text" disabled value={currentUser.sourceSystem} className="w-full bg-slate-800/50 text-slate-400 border border-slate-700/50 rounded-md p-2 text-xs cursor-not-allowed" />
            </div>
          </div>

          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-8 mb-4">Recent Chats</h2>
          <div className="space-y-2 mb-8">
            {history.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No previous chats</p>
            ) : (
              history.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => loadChat(chat.id)}
                  className={`group w-full flex items-center justify-between text-left text-xs p-3 rounded-md transition-colors border cursor-pointer ${currentChatId === chat.id
                      ? 'bg-blue-600/20 text-white border-blue-500/50'
                      : 'bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white border-slate-700/50 hover:border-slate-600'
                    }`}
                >
                  <span className="truncate pr-2">{chat.title}</span>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                    title="Delete Chat"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-8 mb-4">Example Queries</h2>
          <div className="space-y-2">
            {SUGGESTIONS.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setInput(suggestion)}
                className="w-full text-left text-xs p-3 rounded-md bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors border border-slate-700/50 hover:border-slate-600"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
          Powered by gpt-oss:20b-cloud
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative bg-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
          <div className="md:hidden flex items-center gap-3">
            <Database size={20} className="text-blue-600" />
            <h1 className="text-lg font-semibold">Procurement SQL Agent</h1>
          </div>
          <div className="hidden md:block">
            {/* Desktop header left spacer */}
          </div>
          <button
            onClick={startNewChat}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-200"
          >
            <MessageSquare size={16} />
            New Chat
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''
                }`}
            >
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${msg.role === 'user'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-slate-900 text-white'
                  }`}
              >
                {msg.role === 'user' ? <User size={20} /> : <Sparkles size={20} />}
              </div>
              <div
                className={`flex-1 ${msg.role === 'user' ? 'flex justify-end' : ''
                  }`}
              >
                <div
                  className={`rounded-2xl px-6 py-4 shadow-sm ${msg.role === 'user'
                    ? 'bg-blue-600 text-white max-w-[85%]'
                    : 'bg-white border border-slate-200 text-slate-800 w-full'
                    }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  ) : (
                    <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: CodeBlock,
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4 max-w-4xl mx-auto">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm">
                <Sparkles size={20} />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-blue-600" />
                <span className="text-slate-500 text-sm font-medium">Analyzing request and generating SQL...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto relative">
            <form
              onSubmit={handleSubmit}
              className="relative flex items-end gap-2 bg-white border border-slate-300 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all overflow-hidden"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask a question about procurement data... (e.g., 'Show me POs without invoices')"
                className="w-full max-h-48 min-h-[56px] py-4 pl-4 pr-12 bg-transparent border-none focus:ring-0 resize-none text-slate-900 placeholder:text-slate-400"
                rows={1}
                style={{ height: 'auto' }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 bottom-2 p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
              >
                <Send size={20} />
              </button>
            </form>
            <div className="text-center mt-3 text-xs text-slate-400">
              Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded-md font-sans">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded-md font-sans">Shift + Enter</kbd> for new line
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
