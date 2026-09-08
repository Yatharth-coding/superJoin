import { useState, useEffect } from 'react';
import { Upload, LayoutDashboard, Database, Scale, FileCheck2, AlertTriangle, Info } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Database className="w-5 h-5" />
          Fact Knowledge Layer
        </h1>
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
          <TabButton id="dashboard" icon={<LayoutDashboard className="w-4 h-4"/>} label="Dashboard" current={activeTab} set={setActiveTab} />
          <TabButton id="upload" icon={<Upload className="w-4 h-4"/>} label="Upload" current={activeTab} set={setActiveTab} />
          <TabButton id="facts" icon={<Database className="w-4 h-4"/>} label="Facts" current={activeTab} set={setActiveTab} />
          <TabButton id="relationships" icon={<Scale className="w-4 h-4"/>} label="Relationships" current={activeTab} set={setActiveTab} />
          <TabButton id="cases" icon={<FileCheck2 className="w-4 h-4"/>} label="Required Cases" current={activeTab} set={setActiveTab} />
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'upload' && <UploadView />}
        {activeTab === 'facts' && <FactsBrowser />}
        {activeTab === 'relationships' && <RelationshipsBrowser />}
        {activeTab === 'cases' && <RequiredCases />}
      </main>
    </div>
  );
}

function TabButton({ id, icon, label, current, set }: any) {
  const active = id === current;
  return (
    <button 
      onClick={() => set(id)}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${active ? 'bg-indigo-600 text-white font-medium' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
    >
      {icon} {label}
    </button>
  );
}

// -----------------------------------------------------------------------------
// DASHBOARD
// -----------------------------------------------------------------------------
function Dashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats);
  }, []);

  if (!stats) return <div className="p-10 text-center text-slate-500">Loading stats...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">System Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Documents" value={stats.documents} color="blue" />
        <StatCard title="Total Facts" value={stats.facts} color="indigo" />
        <StatCard title="Flagged Issues" value={stats.flaggedFacts} color="red" />
      </div>

      <h3 className="text-xl font-bold text-slate-800 mt-8 border-b pb-2">Relationships Breakdown</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Corroborated" value={stats.relationships.CORROBORATED || 0} color="emerald" />
        <StatCard title="Context Resolved" value={stats.relationships.CONTEXT_RESOLVED || 0} color="amber" />
        <StatCard title="Contradictions" value={stats.relationships.CONTRADICTION || 0} color="red" />
        <StatCard title="Uncertain" value={stats.relationships.UNCERTAIN || 0} color="slate" />
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: any) {
  const bgColors: any = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={`p-6 rounded-xl border ${bgColors[color]} shadow-sm`}>
      <h3 className="text-sm font-semibold uppercase tracking-wider opacity-80 mb-2">{title}</h3>
      <p className="text-4xl font-extrabold">{value}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// UPLOAD
// -----------------------------------------------------------------------------
function UploadView() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [result, setResult] = useState<any>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setStatus('uploading');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setStatus('extracting facts (this takes 30-90s)...');
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      setStatus('reconciling cross-document relationships...');
      const recRes = await fetch(`/api/documents/${data.id}/reconcile`, { method: 'POST' });
      const recData = await recRes.json();
      
      setResult({ document: data, reconciliation: recData });
      setStatus('done');
    } catch (err: any) {
      setStatus('error: ' + err.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Upload Document</h2>
      
      <form onSubmit={handleUpload} className="space-y-6">
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition-colors">
          <input 
            type="file" 
            accept="application/pdf"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
          />
        </div>
        
        <button 
          type="submit" 
          disabled={!file || status.includes('extracting') || status.includes('reconciling')}
          className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
        >
          <Upload className="w-5 h-5" />
          {status.includes('extracting') || status.includes('reconciling') ? 'Processing...' : 'Upload & Process'}
        </button>
      </form>

      {status && (
        <div className="mt-6 p-4 rounded-lg bg-slate-100 text-slate-700 text-sm font-mono whitespace-pre-wrap">
          Status: {status}
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <h4 className="font-bold mb-2">Success!</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>Extracted {result.document.facts?.length || 0} facts</li>
            <li>{result.reconciliation.message}</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// FACTS BROWSER
// -----------------------------------------------------------------------------
function FactsBrowser() {
  const [facts, setFacts] = useState<any[]>([]);
  const [predicate, setPredicate] = useState('');

  useEffect(() => {
    fetch(`/api/facts${predicate ? \`?predicate=\${predicate}\` : ''}`)
      .then(r => r.json())
      .then(d => setFacts(d.facts || []));
  }, [predicate]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-140px)]">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-4 items-center">
        <h2 className="text-lg font-bold text-slate-800 flex-shrink-0">Fact Browser</h2>
        <input 
          type="text" 
          placeholder="Filter by predicate (e.g. revenue)" 
          value={predicate}
          onChange={e => setPredicate(e.target.value)}
          className="px-3 py-1.5 border rounded-md w-64 text-sm"
        />
        <span className="text-sm text-slate-500">{facts.length} facts found</span>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-100 sticky top-0 shadow-sm">
            <tr>
              <th className="p-3 border-b">Subject</th>
              <th className="p-3 border-b">Predicate</th>
              <th className="p-3 border-b">Value</th>
              <th className="p-3 border-b">Norm Value</th>
              <th className="p-3 border-b">Period</th>
              <th className="p-3 border-b w-1/3">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {facts.map(f => (
              <tr key={f.id} className="border-b hover:bg-slate-50 align-top">
                <td className="p-3 font-medium text-slate-700">{f.subject}</td>
                <td className="p-3 text-indigo-600 font-mono text-xs">{f.predicate}</td>
                <td className="p-3">{f.rawValue} {f.rawUnit}</td>
                <td className="p-3">{f.normalizedValue !== null ? \`\${f.normalizedValue} \${f.normalizedUnit}\` : '-'}</td>
                <td className="p-3 text-xs whitespace-nowrap">
                  {f.periodStart ? \`\${f.periodStart} to \${f.periodEnd}\` : 'N/A'}
                  {f.scope && <div className="text-slate-400 mt-1">Scope: {f.scope}</div>}
                </td>
                <td className="p-3 text-xs italic text-slate-600 break-words border-l bg-slate-50/50">
                  "{f.evidenceQuote}"
                  <div className="mt-1 text-[10px] text-slate-400 font-medium">Page {f.sourcePage}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// RELATIONSHIPS BROWSER
// -----------------------------------------------------------------------------
function RelationshipsBrowser() {
  const [rels, setRels] = useState<any[]>([]);
  const [type, setType] = useState('');

  useEffect(() => {
    fetch(`/api/relationships${type ? \`?type=\${type}\` : ''}`)
      .then(r => r.json())
      .then(setRels);
  }, [type]);

  const typeColors: any = {
    CORROBORATED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    CONTRADICTION: 'bg-red-100 text-red-800 border-red-300',
    CONTEXT_RESOLVED: 'bg-amber-100 text-amber-800 border-amber-300',
    UNCERTAIN: 'bg-slate-100 text-slate-800 border-slate-300'
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      <div className="mb-4 flex gap-2">
        {['', 'CORROBORATED', 'CONTRADICTION', 'CONTEXT_RESOLVED', 'UNCERTAIN'].map(t => (
          <button 
            key={t}
            onClick={() => setType(t)}
            className={\`px-3 py-1.5 rounded-full text-sm font-medium border \${type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 hover:bg-slate-50'}\`}
          >
            {t || 'ALL'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto pb-10">
        {rels.map(r => (
          <div key={r.id} className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
            <div className={\`p-3 border-b font-bold text-xs flex justify-between items-center \${typeColors[r.relationshipType]}\`}>
              <span>{r.relationshipType}</span>
              <span>{(r.confidence * 100).toFixed(0)}% Conf</span>
            </div>
            
            <div className="p-4 bg-slate-50 border-b flex-1">
              <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><Info className="w-4 h-4"/> Reasoning</h4>
              <p className="text-sm text-slate-700 leading-relaxed">{r.reasoning}</p>
            </div>
            
            <div className="grid grid-cols-2 divide-x border-b">
              <div className="p-4">
                <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Fact A</div>
                <div className="text-sm font-medium">{r.factA.subject}</div>
                <div className="text-xs font-mono text-indigo-600 mb-2">{r.factA.predicate}</div>
                <div className="text-sm">Raw: {r.factA.rawValue}</div>
                <div className="text-sm">Norm: {r.factA.normalizedValue}</div>
              </div>
              <div className="p-4 bg-slate-50/50">
                <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Fact B</div>
                <div className="text-sm font-medium">{r.factB.subject}</div>
                <div className="text-xs font-mono text-indigo-600 mb-2">{r.factB.predicate}</div>
                <div className="text-sm">Raw: {r.factB.rawValue}</div>
                <div className="text-sm">Norm: {r.factB.normalizedValue}</div>
              </div>
            </div>
            <div className="p-3 text-xs text-center text-slate-400 bg-slate-50 rounded-b-xl">
              ID: {r.id}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// REQUIRED CASES
// -----------------------------------------------------------------------------
function RequiredCases() {
  const ids = {
    CORROBORATED: 'FILL_ME_IN',
    CONTRADICTION: 'FILL_ME_IN',
    CONTEXT_RESOLVED: 'FILL_ME_IN'
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 p-6 rounded-xl">
        <h2 className="text-xl font-bold mb-2">Demo Presentation Cases</h2>
        <p className="text-sm">
          These are the specific relationships curated for the demonstration video. 
          Use the IDs in the database to show exactly how the system handled nuanced financial overlaps.
        </p>
      </div>
      
      <CaseCard type="CORROBORATED" description="Two facts agreeing on identical normalized values." id={ids.CORROBORATED} />
      <CaseCard type="CONTEXT_RESOLVED" description="Apparent difference resolved by context (e.g. FY23 vs FY24, or Adjusted vs Reported)." id={ids.CONTEXT_RESOLVED} />
      <CaseCard type="CONTRADICTION" description="Genuine conflict in the documents for the exact same metric, period, and scope." id={ids.CONTRADICTION} />
      
      <div className="bg-red-50 border border-red-200 p-6 rounded-xl">
        <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Extraction/Reasoning Failure</h3>
        <p className="text-sm text-red-700 mb-4">
          A manually flagged fact demonstrating a known limitation of the current AI approach.
        </p>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="text-xs font-mono text-slate-400 mb-1">Fact ID: FILL_ME_IN</div>
          <p className="text-sm font-medium">Reasoning for failure: ...</p>
        </div>
      </div>
    </div>
  );
}

function CaseCard({ type, description, id }: any) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (id && id !== 'FILL_ME_IN') {
      fetch(\`/api/relationships/\${id}\`).then(r => r.json()).then(setData);
    }
  }, [id]);

  return (
    <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-lg">{type}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">ID: {id}</div>
      </div>
      
      {data ? (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
           <div className="bg-slate-50 p-4 border-b">
             <span className="text-xs font-bold uppercase text-indigo-600 block mb-1">LLM Reasoning</span>
             {data.reasoning}
           </div>
           <div className="grid grid-cols-2 divide-x bg-white">
             <div className="p-4">
               <div className="text-xs font-bold mb-2">Fact A ({data.factA.document.filename})</div>
               <div className="text-sm mb-2">"{data.factA.evidenceQuote}" (Page {data.factA.sourcePage})</div>
               <div className="bg-slate-100 p-2 rounded text-xs font-mono">Norm: {data.factA.normalizedValue}</div>
             </div>
             <div className="p-4">
               <div className="text-xs font-bold mb-2">Fact B ({data.factB.document.filename})</div>
               <div className="text-sm mb-2">"{data.factB.evidenceQuote}" (Page {data.factB.sourcePage})</div>
               <div className="bg-slate-100 p-2 rounded text-xs font-mono">Norm: {data.factB.normalizedValue}</div>
             </div>
           </div>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-lg">
          Relationship data pending...
        </div>
      )}
    </div>
  );
}
