import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, LayoutDashboard, Database, Scale, FileCheck2, AlertTriangle, Info, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, RefreshCw, Search, FileText } from 'lucide-react';

const API = '/api';

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
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(() => {
    setLoading(true);
    fetch(`${API}/stats`).then(r => r.json()).then(data => {
      setStats(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading && !stats) return <div className="p-10 text-center text-slate-500">Loading stats...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">System Dashboard</h2>
        <button onClick={loadStats} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Documents" value={stats?.documents ?? 0} color="blue" />
        <StatCard title="Total Facts" value={stats?.facts ?? 0} color="indigo" />
        <StatCard title="Flagged Issues" value={stats?.flaggedFacts ?? 0} color="red" />
      </div>

      <h3 className="text-xl font-bold text-slate-800 mt-8 border-b pb-2">Relationships Breakdown</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Corroborated" value={stats?.relationships?.CORROBORATED || 0} color="emerald" />
        <StatCard title="Context Resolved" value={stats?.relationships?.CONTEXT_RESOLVED || 0} color="amber" />
        <StatCard title="Contradictions" value={stats?.relationships?.CONTRADICTION || 0} color="red" />
        <StatCard title="Uncertain" value={stats?.relationships?.UNCERTAIN || 0} color="slate" />
      </div>

      {/* Recent Documents */}
      {stats?.recentDocuments && stats.recentDocuments.length > 0 && (
        <>
          <h3 className="text-xl font-bold text-slate-800 mt-8 border-b pb-2">Recent Documents</h3>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 border-b font-semibold">Filename</th>
                  <th className="p-3 border-b font-semibold">Status</th>
                  <th className="p-3 border-b font-semibold">Pages</th>
                  <th className="p-3 border-b font-semibold">Facts</th>
                  <th className="p-3 border-b font-semibold">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentDocuments.map((doc: any) => (
                  <tr key={doc.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      {doc.filename}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="p-3">{doc.pageCount}</td>
                    <td className="p-3 font-bold">{doc._count?.facts ?? 0}</td>
                    <td className="p-3 text-xs text-slate-500">{new Date(doc.uploadedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done: 'bg-emerald-100 text-emerald-800',
    processing: 'bg-blue-100 text-blue-800',
    pending: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
  };
  const icons: Record<string, any> = {
    done: <CheckCircle2 className="w-3 h-3" />,
    processing: <RefreshCw className="w-3 h-3 animate-spin" />,
    pending: <Clock className="w-3 h-3" />,
    error: <XCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {icons[status]} {status}
    </span>
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
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setProgress(null);
    setResult(null);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Step 1: Upload file (returns immediately now)
      setProgress({ stage: 'uploading', message: 'Uploading file to server...' });
      const res = await fetch(`${API}/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }
      
      const doc = await res.json();
      setProgress({ stage: 'uploaded', message: `File uploaded. Document ID: ${doc.id.slice(0, 8)}... Starting extraction...` });

      // Step 2: Connect to SSE progress stream
      const es = new EventSource(`${API}/documents/${doc.id}/progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProgress(data);
          
          if (data.stage === 'done') {
            setResult(data);
            setUploading(false);
            es.close();
          } else if (data.stage === 'error') {
            setError(data.message);
            setUploading(false);
            es.close();
          }
        } catch {}
      };

      es.onerror = () => {
        // SSE connection ended — poll for final status
        es.close();
        pollDocumentStatus(doc.id);
      };

    } catch (err: any) {
      setError(err.message);
      setUploading(false);
    }
  };

  const pollDocumentStatus = async (docId: string) => {
    // Poll every 3 seconds until done
    const poll = async () => {
      try {
        const res = await fetch(`${API}/documents/${docId}`);
        const doc = await res.json();
        
        if (doc.status === 'done') {
          setResult({ 
            stage: 'done', 
            factsExtracted: doc.facts?.length || 0, 
            message: `Complete! ${doc.facts?.length || 0} facts extracted.` 
          });
          setUploading(false);
        } else if (doc.status === 'error') {
          setError('Processing failed. Check server logs for details.');
          setUploading(false);
        } else {
          setProgress({ 
            stage: 'processing', 
            message: `Still processing... (status: ${doc.status})` 
          });
          setTimeout(poll, 3000);
        }
      } catch {
        setTimeout(poll, 5000);
      }
    };
    poll();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Upload Document</h2>
      
      <form onSubmit={handleUpload} className="space-y-6">
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition-colors">
          <input 
            type="file" 
            accept="application/pdf"
            onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); setError(''); }}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
          />
        </div>
        
        <button 
          type="submit" 
          disabled={!file || uploading}
          className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
        >
          <Upload className="w-5 h-5" />
          {uploading ? 'Processing...' : 'Upload & Process'}
        </button>
      </form>

      {/* Progress display */}
      {progress && !result && !error && (
        <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="font-bold text-sm uppercase">{progress.stage}</span>
          </div>
          <p className="text-sm">{progress.message}</p>
          
          {/* Progress bar */}
          {progress.chunksTotal && progress.chunksTotal > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span>Chunks: {progress.chunksProcessed || 0}/{progress.chunksTotal}</span>
                <span>Facts: {progress.factsExtracted || 0}</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.round(((progress.chunksProcessed || 0) / progress.chunksTotal) * 100)}%` }} 
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5" />
            <h4 className="font-bold">Processing Complete!</h4>
          </div>
          <p className="text-sm">{result.message || `${result.factsExtracted} facts extracted successfully.`}</p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5" />
            <h4 className="font-bold">Error</h4>
          </div>
          <p className="text-sm">{error}</p>
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
  const [total, setTotal] = useState(0);
  const [predicate, setPredicate] = useState('');
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (predicate) params.set('predicate', predicate);
    if (subject) params.set('subject', subject);
    
    fetch(`${API}/facts?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        const allFacts = d.facts || [];
        setTotal(allFacts.length);
        setFacts(allFacts);
        setPage(0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [predicate, subject]);

  const paginatedFacts = facts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(facts.length / PAGE_SIZE);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-140px)]">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-center">
        <h2 className="text-lg font-bold text-slate-800 flex-shrink-0">Fact Browser</h2>
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter by predicate" 
            value={predicate}
            onChange={e => setPredicate(e.target.value)}
            className="px-3 py-1.5 border rounded-md w-48 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter by subject" 
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="px-3 py-1.5 border rounded-md w-48 text-sm"
          />
        </div>
        <span className="text-sm text-slate-500 font-bold">{total} facts found</span>
      </div>
      
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading facts...
        </div>
      ) : facts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-2">
          <Database className="w-8 h-8" />
          <p className="text-lg font-medium">No facts found</p>
          <p className="text-sm">Upload a PDF document to start extracting facts.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-100 sticky top-0 shadow-sm">
                <tr>
                  <th className="p-3 border-b">Subject</th>
                  <th className="p-3 border-b">Predicate</th>
                  <th className="p-3 border-b">Value</th>
                  <th className="p-3 border-b">Norm Value</th>
                  <th className="p-3 border-b">Period</th>
                  <th className="p-3 border-b">Source</th>
                  <th className="p-3 border-b w-1/4">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFacts.map(f => (
                  <tr key={f.id} className="border-b hover:bg-slate-50 align-top">
                    <td className="p-3 font-medium text-slate-700">{f.subject}</td>
                    <td className="p-3 text-indigo-600 font-mono text-xs">{f.predicate}</td>
                    <td className="p-3 whitespace-nowrap">{f.rawValue} {f.rawUnit}</td>
                    <td className="p-3 whitespace-nowrap">{f.normalizedValue !== null ? `${f.normalizedValue?.toLocaleString()} ${f.normalizedUnit || ''}` : '-'}</td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {f.periodStart ? `${f.periodStart} to ${f.periodEnd}` : 'N/A'}
                      {f.scope && <div className="text-slate-400 mt-1">Scope: {f.scope}</div>}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      <div className="text-slate-500">{f.document?.filename?.slice(0, 20) || ''}</div>
                      <div className="text-slate-400">p.{f.sourcePage}</div>
                    </td>
                    <td className="p-3 text-xs italic text-slate-600 break-words border-l bg-slate-50/50">
                      "{f.evidenceQuote?.slice(0, 150)}{f.evidenceQuote?.length > 150 ? '...' : ''}"
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t bg-slate-50 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setPage(p => Math.max(0, p - 1))} 
                  disabled={page === 0}
                  className="px-3 py-1 text-sm bg-white border rounded hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-slate-600">Page {page + 1} of {totalPages}</span>
                <button 
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} 
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 text-sm bg-white border rounded hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// RELATIONSHIPS BROWSER
// -----------------------------------------------------------------------------
function RelationshipsBrowser() {
  const [rels, setRels] = useState<any[]>([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Fetch counts for badges
  useEffect(() => {
    fetch(`${API}/stats`).then(r => r.json()).then(data => {
      setCounts(data.relationships || {});
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/relationships${type ? `?type=${type}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setRels(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [type]);

  const typeColors: any = {
    CORROBORATED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    CONTRADICTION: 'bg-red-100 text-red-800 border-red-300',
    CONTEXT_RESOLVED: 'bg-amber-100 text-amber-800 border-amber-300',
    UNCERTAIN: 'bg-slate-100 text-slate-800 border-slate-300'
  };

  const typeLabels: Record<string, string> = {
    '': 'ALL',
    CORROBORATED: 'Corroborated',
    CONTRADICTION: 'Contradiction',
    CONTEXT_RESOLVED: 'Context Resolved',
    UNCERTAIN: 'Uncertain'
  };

  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      <div className="mb-4 flex gap-2 flex-wrap">
        {['', 'CORROBORATED', 'CONTRADICTION', 'CONTEXT_RESOLVED', 'UNCERTAIN'].map(t => (
          <button 
            key={t}
            onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border flex items-center gap-1.5 ${type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {typeLabels[t]}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${type === t ? 'bg-indigo-500' : 'bg-slate-100'}`}>
              {t === '' ? allCount : (counts[t] || 0)}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading relationships...
        </div>
      ) : rels.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-2">
          <Scale className="w-8 h-8" />
          <p className="text-lg font-medium">No {type ? typeLabels[type].toLowerCase() : ''} relationships found</p>
          <p className="text-sm">Upload multiple PDFs and relationships will be discovered automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto pb-10">
          {rels.map(r => (
            <RelationshipCard key={r.id} rel={r} typeColors={typeColors} />
          ))}
        </div>
      )}
    </div>
  );
}

function RelationshipCard({ rel: r, typeColors }: any) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
      <div className={`p-3 border-b font-bold text-xs flex justify-between items-center ${typeColors[r.relationshipType]}`}>
        <span>{r.relationshipType.replace('_', ' ')}</span>
        <span>{(r.confidence * 100).toFixed(0)}% Confidence</span>
      </div>
      
      <div className="p-4 bg-slate-50 border-b">
        <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><Info className="w-4 h-4"/> Reasoning</h4>
        <p className="text-sm text-slate-700 leading-relaxed">{r.reasoning}</p>
      </div>
      
      <div className="grid grid-cols-2 divide-x border-b">
        <FactSummary label="Fact A" fact={r.factA} />
        <FactSummary label="Fact B" fact={r.factB} />
      </div>
      
      {/* Expandable evidence */}
      <button 
        onClick={() => setExpanded(!expanded)} 
        className="p-2 text-xs text-center text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-1 transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Hide evidence' : 'Show evidence quotes'}
      </button>
      
      {expanded && (
        <div className="grid grid-cols-2 divide-x border-t bg-slate-50">
          <div className="p-3">
            <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Evidence A</div>
            <p className="text-xs italic text-slate-600">"{r.factA?.evidenceQuote}"</p>
            <div className="text-[10px] text-slate-400 mt-1">
              {r.factA?.document?.filename} — p.{r.factA?.sourcePage}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Evidence B</div>
            <p className="text-xs italic text-slate-600">"{r.factB?.evidenceQuote}"</p>
            <div className="text-[10px] text-slate-400 mt-1">
              {r.factB?.document?.filename} — p.{r.factB?.sourcePage}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FactSummary({ label, fact }: { label: string; fact: any }) {
  return (
    <div className="p-4">
      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">{label}</div>
      <div className="text-sm font-medium">{fact?.subject}</div>
      <div className="text-xs font-mono text-indigo-600 mb-2">{fact?.predicate}</div>
      <div className="text-xs space-y-0.5">
        <div><span className="text-slate-400">Raw:</span> {fact?.rawValue} {fact?.rawUnit || ''}</div>
        <div><span className="text-slate-400">Norm:</span> {fact?.normalizedValue?.toLocaleString() ?? 'N/A'} {fact?.normalizedUnit || ''}</div>
        {(fact?.periodStart || fact?.periodEnd) && (
          <div><span className="text-slate-400">Period:</span> {fact?.periodStart} → {fact?.periodEnd}</div>
        )}
        {fact?.scope && <div><span className="text-slate-400">Scope:</span> {fact?.scope}</div>}
      </div>
      <div className="text-[10px] text-slate-400 mt-2">{fact?.document?.filename}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// REQUIRED CASES
// -----------------------------------------------------------------------------
function RequiredCases() {
  const [cases, setCases] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/required-cases`)
      .then(r => r.json())
      .then(data => { setCases(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10 text-center text-slate-500">Loading required cases...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 p-6 rounded-xl">
        <h2 className="text-xl font-bold mb-2">The Four Required Cases</h2>
        <p className="text-sm">
          These are automatically discovered examples from the uploaded documents, demonstrating how the system handles 
          corroboration, contradiction, context resolution, and extraction failures.
        </p>
      </div>
      
      {/* Case 1: Corroborated */}
      <RequiredCaseCard 
        type="CORROBORATED" 
        title="1. Fact Corroborated Across Documents"
        description="Two facts agreeing on identical values, even if expressed differently."
        color="emerald"
        icon={<CheckCircle2 className="w-5 h-5" />}
        data={cases?.CORROBORATED}
      />

      {/* Case 2: Contradiction */}
      <RequiredCaseCard 
        type="CONTRADICTION" 
        title="2. Genuine Contradiction"
        description="Two facts that genuinely conflict for the same metric, period, and scope."
        color="red"
        icon={<XCircle className="w-5 h-5" />}
        data={cases?.CONTRADICTION}
      />

      {/* Case 3: Context Resolved */}
      <RequiredCaseCard 
        type="CONTEXT_RESOLVED" 
        title="3. Apparent Contradiction Explained by Context"
        description="Facts that differ in value but can be reconciled through differences in time period, scope, units, or reporting basis."
        color="amber"
        icon={<Info className="w-5 h-5" />}
        data={cases?.CONTEXT_RESOLVED}
      />

      {/* Case 4: Extraction Failure */}
      <div className={`bg-white border rounded-xl shadow-sm overflow-hidden ${cases?.EXTRACTION_FAILURE ? 'border-red-200' : 'border-slate-200'}`}>
        <div className="bg-red-50 p-4 border-b border-red-200">
          <h3 className="font-bold text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            4. Extraction/Reasoning Failure
          </h3>
          <p className="text-sm text-red-700 mt-1">
            A fact demonstrating a known limitation — low confidence extraction, ambiguous data, or reasoning error.
          </p>
        </div>
        
        {cases?.EXTRACTION_FAILURE ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Subject</div>
                <div className="text-sm font-medium">{cases.EXTRACTION_FAILURE.subject}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Predicate</div>
                <div className="text-sm font-mono text-indigo-600">{cases.EXTRACTION_FAILURE.predicate}</div>
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Value</div>
              <div className="text-sm">{cases.EXTRACTION_FAILURE.rawValue} {cases.EXTRACTION_FAILURE.rawUnit}</div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Confidence</div>
              <div className="text-sm">
                <span className={`font-bold ${cases.EXTRACTION_FAILURE.confidence < 0.6 ? 'text-red-600' : 'text-amber-600'}`}>
                  {(cases.EXTRACTION_FAILURE.confidence * 100).toFixed(0)}%
                </span>
                {cases.EXTRACTION_FAILURE.isFlagged && <span className="ml-2 text-red-600 text-xs font-bold">⚑ FLAGGED</span>}
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Evidence Quote</div>
              <p className="text-sm italic text-slate-600">"{cases.EXTRACTION_FAILURE.evidenceQuote}"</p>
              <div className="text-xs text-slate-400 mt-1">
                {cases.EXTRACTION_FAILURE.document?.filename} — Page {cases.EXTRACTION_FAILURE.sourcePage}
              </div>
            </div>
            {cases.EXTRACTION_FAILURE.extractionNotes && (
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                <div className="text-xs font-bold text-amber-600 uppercase mb-1">Extraction Notes</div>
                <p className="text-sm text-amber-800">{cases.EXTRACTION_FAILURE.extractionNotes}</p>
              </div>
            )}
            {cases.EXTRACTION_FAILURE.flagReason && (
              <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                <div className="text-xs font-bold text-red-600 uppercase mb-1">Flag Reason</div>
                <p className="text-sm text-red-800">{cases.EXTRACTION_FAILURE.flagReason}</p>
              </div>
            )}
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <div className="text-xs font-bold text-blue-600 uppercase mb-1">How We Would Improve This</div>
              <p className="text-sm text-blue-800">
                Low-confidence extractions indicate ambiguity in the source text. Improvements would include:
                multi-pass extraction with cross-validation, domain-specific entity resolution, 
                and human-in-the-loop review for facts below a confidence threshold.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-lg m-4">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No extraction failures detected yet</p>
            <p className="text-sm mt-1">Upload and process documents — any low-confidence or flagged facts will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RequiredCaseCard({ type, title, description, color, icon, data }: any) {
  const borderColors: Record<string, string> = {
    emerald: 'border-emerald-200',
    red: 'border-red-200',
    amber: 'border-amber-200',
  };
  const bgColors: Record<string, string> = {
    emerald: 'bg-emerald-50',
    red: 'bg-red-50',
    amber: 'bg-amber-50',
  };
  const textColors: Record<string, string> = {
    emerald: 'text-emerald-800',
    red: 'text-red-800',
    amber: 'text-amber-800',
  };

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden ${borderColors[color]}`}>
      <div className={`${bgColors[color]} p-4 border-b ${borderColors[color]}`}>
        <h3 className={`font-bold ${textColors[color]} flex items-center gap-2`}>
          {icon} {title}
        </h3>
        <p className={`text-sm ${textColors[color]} opacity-80 mt-1`}>{description}</p>
      </div>
      
      {data ? (
        <div className="p-4 space-y-3">
          {/* Confidence badge */}
          <div className="flex justify-between items-center">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${bgColors[color]} ${textColors[color]}`}>
              {type.replace('_', ' ')}
            </span>
            <span className="text-xs text-slate-500">{(data.confidence * 100).toFixed(0)}% confidence</span>
          </div>
          
          {/* Reasoning */}
          <div className="bg-slate-50 p-3 rounded-lg">
            <div className="text-xs font-bold text-indigo-600 uppercase mb-1">System Reasoning</div>
            <p className="text-sm text-slate-700 leading-relaxed">{data.reasoning}</p>
          </div>
          
          {/* Facts comparison */}
          <div className="grid grid-cols-2 divide-x border rounded-lg overflow-hidden">
            <div className="p-3">
              <div className="text-xs font-bold uppercase text-slate-400 mb-2">Fact A</div>
              <div className="text-sm font-medium">{data.factA?.subject}</div>
              <div className="text-xs font-mono text-indigo-600 mb-2">{data.factA?.predicate}</div>
              <div className="text-xs space-y-1">
                <div>Value: {data.factA?.rawValue} {data.factA?.rawUnit || ''}</div>
                <div>Norm: {data.factA?.normalizedValue?.toLocaleString() ?? 'N/A'} {data.factA?.normalizedUnit || ''}</div>
                {data.factA?.periodStart && <div>Period: {data.factA.periodStart} → {data.factA.periodEnd}</div>}
                {data.factA?.scope && <div>Scope: {data.factA.scope}</div>}
              </div>
              <div className="mt-2 text-xs italic text-slate-500">"{data.factA?.evidenceQuote?.slice(0, 120)}..."</div>
              <div className="text-[10px] text-slate-400 mt-1">
                {data.factA?.document?.filename} — p.{data.factA?.sourcePage}
              </div>
            </div>
            <div className="p-3 bg-slate-50/50">
              <div className="text-xs font-bold uppercase text-slate-400 mb-2">Fact B</div>
              <div className="text-sm font-medium">{data.factB?.subject}</div>
              <div className="text-xs font-mono text-indigo-600 mb-2">{data.factB?.predicate}</div>
              <div className="text-xs space-y-1">
                <div>Value: {data.factB?.rawValue} {data.factB?.rawUnit || ''}</div>
                <div>Norm: {data.factB?.normalizedValue?.toLocaleString() ?? 'N/A'} {data.factB?.normalizedUnit || ''}</div>
                {data.factB?.periodStart && <div>Period: {data.factB.periodStart} → {data.factB.periodEnd}</div>}
                {data.factB?.scope && <div>Scope: {data.factB.scope}</div>}
              </div>
              <div className="mt-2 text-xs italic text-slate-500">"{data.factB?.evidenceQuote?.slice(0, 120)}..."</div>
              <div className="text-[10px] text-slate-400 mt-1">
                {data.factB?.document?.filename} — p.{data.factB?.sourcePage}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-400">
          <Scale className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="font-medium">No {type.toLowerCase().replace('_', ' ')} example found yet</p>
          <p className="text-sm mt-1">Upload and process documents to discover this relationship type.</p>
        </div>
      )}
    </div>
  );
}
