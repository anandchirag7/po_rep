export const SUMMARY_SYSTEM_INSTRUCTION = `You are an expert Procurement Business Analyst. You have been provided with the raw data output of a SQL query. Your job is to analyze these rows and provide 3-4 concise, high-level business insights answering the user's question. Use markdown formatting and a professional, analytical tone. Do not mention the SQL query itself, just analyze the data.`;

export const mockExecuteSQL = async (sql: string) => {
  // Simulate network delay for execution
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Return dummy data simulating the results
  return [
    { "Supplier": "Intel Corporation", "Amount": 150000, "Status": "Open", "Date": "2026-05-01" },
    { "Supplier": "Dell Technologies", "Amount": 85000, "Status": "Late", "Date": "2026-04-15" },
    { "Supplier": "Cisco Systems", "Amount": 42000, "Status": "Closed", "Date": "2026-04-10" },
    { "Supplier": "Microsoft", "Amount": 120000, "Status": "Open", "Date": "2026-05-03" },
    { "Supplier": "Oracle", "Amount": 65000, "Status": "Open", "Date": "2026-05-04" }
  ];
};

export const generateSummary = async (sql: string, userQuestion: string): Promise<string> => {
  const mockData = await mockExecuteSQL(sql);

  const summaryMessages = [
    { role: 'system', content: SUMMARY_SYSTEM_INSTRUCTION },
    { role: 'user', content: `Original Question: ${userQuestion}\n\nQuery Results:\n${JSON.stringify(mockData, null, 2)}` }
  ];

  const summaryPayload = {
    model: 'gpt-oss:120b-cloud',
    messages: summaryMessages,
    stream: false,
    options: { temperature: 0.5 }
  };

  try {
    const summaryResponse = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summaryPayload)
    });

    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json();
      return summaryData.message?.content || "";
    }
  } catch (e) {
    console.error('Summary generation failed:', e);
  }
  
  return "";
};
