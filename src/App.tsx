import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-anon-key');

async function api(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('resgatista-v2-api', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

type ClassItem = { id: string; code: string; title: string; lesson_date: string | null; status: 'planned' | 'active' | 'closed' };
type Attempt = { id: string; student_name: string; score: number; total_questions: number; grade: number; submitted_at: string };
type Question = { id?: string; position?: number; prompt: string; options: string[]; correct_option?: number; explanation?: string };
const statusText: Record<string, string> = { planned: 'Planejada', active: 'Em andamento', closed: 'Encerrada' };

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className="brand"><span className="brand-mark">R</span><span className="brand-name">RESGATISTA<small>WEB 3.0</small></span>{!compact && <span className="brand-tag">FORMAÇÃO • AVALIAÇÃO • DESEMPENHO</span>}</Link>;
}

function AppFrame({ children, publicPage = false }: { children: React.ReactNode; publicPage?: boolean }) {
  return <div className="app-frame"><header className="topbar"><Brand/><div className="topbar-right"><span className="online-dot"/> Plataforma de avaliações</div></header><main className={publicPage ? 'public-main' : 'app-main'}>{children}</main><footer className="app-footer">RESGATISTA WEB 3.0 <span>•</span> Ambiente de aprendizagem e avaliação</footer></div>;
}

function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError || !data.session) setError(authError?.message || 'Não foi possível entrar.');
    else onLogin(data.session);
  }
  return <AppFrame><section className="login-layout"><div className="login-intro"><div className="eyebrow light">AMBIENTE DO INSTRUTOR</div><h1>Ensinar.<br/><em>Avaliar.</em><br/>Evoluir.</h1><p>Gerencie suas turmas, acompanhe o desempenho dos participantes e conduza avaliações com mais clareza.</p><div className="login-points"><span>✓ Avaliações digitais</span><span>✓ Resultados em tempo real</span><span>✓ Apresentação para a turma</span></div></div><form className="login-card" onSubmit={submit}><div className="login-symbol">R</div><div className="eyebrow">ACESSO RESTRITO</div><h2>Bem-vindo de volta</h2><p>Entre com suas credenciais de instrutor.</p><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="username"/></label><label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" required autoComplete="current-password"/></label>{error && <div className="alert error">{error}</div>}<button className="btn primary full" disabled={busy}>{busy ? 'Entrando…' : 'Acessar painel'} <span>→</span></button><small className="login-note">Acesso disponível somente para instrutores autorizados.</small></form></section></AppFrame>;
}

function StudentExam() {
  const { code = '' } = useParams();
  const [exam, setExam] = useState<any>(null);
  const [name, setName] = useState('');
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api({ action: 'publicExam', classCode: code }).then(data => { setExam(data); setAnswers(data.questions.map(() => null)); }).catch(e => setError(e.message)); }, [code]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (answers.some(answer => answer === null)) { setError('Responda todas as questões antes de finalizar.'); return; }
    setBusy(true);
    try { const data = await api({ action: 'submit', classCode: code, studentName: name, answers }); setResult(data.attempt); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <AppFrame publicPage><div className="student-wrap">{result ? <section className="success-card"><div className="success-icon">✓</div><div className="eyebrow">AVALIAÇÃO REGISTRADA</div><h1>Prova finalizada!</h1><div className="final-grade">{Number(result.grade).toFixed(2)}<small>/10</small></div><p>{result.score} acertos de {result.total_questions} questões.</p><p>Seu resultado foi encaminhado ao instrutor.</p></section> : exam ? <><div className="student-heading"><div className="eyebrow">AVALIAÇÃO • TURMA {exam.class.code}</div><h1>{exam.class.title}</h1><p>Preencha seu nome e responda às questões com atenção.</p></div><form onSubmit={submit}><section className="panel student-name"><label>Nome completo<input value={name} onChange={e => setName(e.target.value)} minLength={2} placeholder="Digite seu nome" required/></label></section>{exam.questions.map((question: Question, index: number) => <section className="panel question-form" key={question.id || index}><div className="question-number">QUESTÃO {String(index + 1).padStart(2, '0')} <span>{index + 1} de {exam.questions.length}</span></div><h2>{question.prompt}</h2><div className="answer-list">{question.options.map((option, optionIndex) => <label className={'answer-option ' + (answers[index] === optionIndex ? 'selected' : '')} key={optionIndex}><input type="radio" name={'question-' + index} checked={answers[index] === optionIndex} onChange={() => setAnswers(old => old.map((value, i) => i === index ? optionIndex : value))}/><b>{String.fromCharCode(65 + optionIndex)}</b><span>{option}</span></label>)}</div></section>)}{error && <div className="alert error">{error}</div>}<button className="btn primary full submit-exam" disabled={busy}>{busy ? 'Enviando avaliação…' : 'Finalizar avaliação'} <span>→</span></button></form></> : <div className="panel loading-card">{error || 'Carregando avaliação…'}</div>}</div></AppFrame>;
}

function Presentation({ data, onClose, onRefresh }: { data: any; onClose: () => void; onRefresh: () => void }) {
  const summary = data.summary || {};
  const attempts: Attempt[] = data.attempts || [];
  const questions: Question[] = data.questions || [];
  const stats = data.questionStats || [];
  const percent = (value: number) => attempts.length ? Math.round(value / attempts.length * 100) : 0;
  async function fullscreen() { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); else await document.exitFullscreen?.(); }
  return <div className="presentation-screen"><div className="presentation-head"><div><div className="eyebrow">RESGATISTA WEB 3.0 • RESULTADOS AO VIVO</div><h1>{data.class?.title}</h1><p>Turma {data.class?.code} <span>•</span> {attempts.length} participantes</p></div><div className="toolbar"><button className="btn secondary" onClick={onRefresh}>↻ Atualizar</button><button className="btn secondary" onClick={fullscreen}>⛶ Tela cheia</button><button className="btn primary" onClick={onClose}>Voltar ao painel</button></div></div><div className="presentation-metrics"><Metric label="Participantes" value={summary.total ?? 0}/><Metric label="Média da turma" value={Number(summary.average || 0).toFixed(2)}/><Metric label="Maior nota" value={summary.highest == null ? '—' : Number(summary.highest).toFixed(2)}/><Metric label="Aproveitamento ≥ 7" value={Number(summary.passRate || 0).toFixed(1) + '%'}/></div><div className="section-heading"><div><div className="eyebrow">ANÁLISE DA AVALIAÇÃO</div><h2>Desempenho por questão</h2></div><span className="live-pill"><i/> Atualização em tempo real</span></div>{!attempts.length ? <div className="presentation-wait"><div className="wait-icon">◷</div><h2>Aguardando avaliações</h2><p>Os resultados aparecerão aqui assim que os participantes enviarem suas provas.</p></div> : <div className="presentation-grid">{questions.map((question, index) => { const stat = stats[index] || { correct: 0, wrong: 0, unanswered: 0 }; return <article className="presentation-question" key={question.id || index}><div className="question-number">QUESTÃO {String(index + 1).padStart(2, '0')}<b>{percent(stat.correct)}% de acertos</b></div><h3>{question.prompt}</h3><ResultBar label="Acertos" count={stat.correct} percent={percent(stat.correct)} type="correct"/><ResultBar label="Erros" count={stat.wrong} percent={percent(stat.wrong)} type="wrong"/><ResultBar label="Em branco" count={stat.unanswered} percent={percent(stat.unanswered)} type="blank"/><div className="answer-key"><b>Gabarito:</b> {String.fromCharCode(65 + Number(question.correct_option))} — {question.options?.[question.correct_option]}</div>{question.explanation && <p>{question.explanation}</p>}</article>; })}</div>}<div className="presentation-bottom">RESGATISTA WEB 3.0 <span>•</span> Resultados atualizados conforme o envio das avaliações</div></div>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>; }
function ResultBar({ label, count, percent, type }: { label: string; count: number; percent: number; type: string }) { return <div className="result-line"><span>{label}</span><div className="result-rail"><i className={type} style={{ width: percent + '%' }}/></div><b>{count} <small>({percent}%)</small></b></div>; }

function InstructorDashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selected, setSelected] = useState<ClassItem | null>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [questionsJson, setQuestionsJson] = useState('');
  const [pin, setPin] = useState('');
  const [target, setTarget] = useState<Attempt | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [busy, setBusy] = useState(false);
  async function loadClasses() { try { const result = await api({ action: 'listClasses' }); setClasses(result.classes || []); } catch (e) { setError((e as Error).message); } }
  async function loadDashboard(classItem = selected) { if (!classItem) return; try { setData(await api({ action: 'dashboard', classCode: classItem.code })); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { loadClasses(); }, []);
  useEffect(() => { if (!selected) return; loadDashboard(selected); const channel = supabase.channel('web3-' + selected.id).on('postgres_changes', { event: '*', schema: 'public', table: 'resgatista_v2_attempts', filter: 'class_id=eq.' + selected.id }, () => loadDashboard(selected)).subscribe(); return () => { supabase.removeChannel(channel); }; }, [selected?.id]);
  const examUrl = useMemo(() => selected ? location.origin + import.meta.env.BASE_URL + 'prova/' + selected.code : '', [selected]);
  const summary = data?.summary;
  async function createClass(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await api({ action: 'saveClass', code, title, lessonDate: date || null }); await loadClasses(); setSelected(result.class); setCode(''); setTitle(''); setDate(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function changeStatus(status: string) { if (!selected) return; setBusy(true); setError(''); try { const result = await api({ action: 'setClassStatus', classId: selected.id, status }); setSelected(result.class); await loadClasses(); await loadDashboard(result.class); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function saveQuestions(event: React.FormEvent) { event.preventDefault(); if (!selected) return; setBusy(true); setError(''); try { const questions = JSON.parse(questionsJson); await api({ action: 'saveQuestions', classId: selected.id, questions }); await loadDashboard(); setQuestionsJson(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function deleteAttempt() { if (!selected || !target) return; setBusy(true); setError(''); try { await api({ action: 'deleteAttempt', attemptId: target.id, expectedName: target.student_name, pin }); setTarget(null); setPin(''); await loadDashboard(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function resetResults() { if (!selected || !window.confirm('Excluir todas as tentativas desta turma? Esta ação não pode ser desfeita.')) return; const adminPin = window.prompt('Informe o PIN administrativo de 6 dígitos:'); if (!adminPin) return; setBusy(true); setError(''); try { await api({ action: 'deleteClassAttempts', classId: selected.id, pin: adminPin }); await loadDashboard(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (showPresentation && selected && data) return <Presentation data={data} onClose={() => setShowPresentation(false)} onRefresh={() => loadDashboard(selected)}/>;
  return <AppFrame><div className="dashboard-heading"><div><div className="eyebrow">PAINEL DO INSTRUTOR</div><h1>Central de avaliações</h1><p>Organize suas turmas e acompanhe o desempenho dos participantes.</p></div><button className="btn ghost" onClick={onLogout}>Sair da conta ↗</button></div>{error && <div className="alert error">{error}<button onClick={() => setError('')}>×</button></div>}<div className="dashboard-layout"><aside className="sidebar"><div className="panel"><div className="panel-title"><div><div className="eyebrow">GESTÃO</div><h2>Nova turma</h2></div><span className="panel-icon">＋</span></div><form className="create-form" onSubmit={createClass}><label>Código da turma<input value={code} onChange={e => setCode(e.target.value)} placeholder="Ex.: 10.2" required/></label><label>Nome da turma<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Curso de Resgatista" required/></label><label>Data da atividade<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label><button className="btn primary full" disabled={busy}>Criar turma <span>＋</span></button></form></div><div className="panel class-list-panel"><div className="panel-title"><div><div className="eyebrow">SEU AMBIENTE</div><h2>Turmas cadastradas</h2></div><span className="count-badge">{classes.length}</span></div>{classes.length ? <div className="class-list">{classes.map(item => <button className={'class-item ' + (selected?.id === item.id ? 'active' : '')} key={item.id} onClick={() => { setSelected(item); setShowQr(false); setShowPresentation(false); }}><span className="class-item-top"><b>{item.code}</b><i className={'status-dot ' + item.status}/></span><strong>{item.title}</strong><small>{statusText[item.status] || item.status}</small></button>)}</div> : <p className="empty-note">Nenhuma turma cadastrada ainda.</p>}</div><div className="sidebar-user"><div className="avatar">{(session.user.email || 'I').slice(0, 1).toUpperCase()}</div><div><b>Instrutor</b><small>{session.user.email}</small></div></div></aside><section className="workspace">{selected ? <><div className="panel selected-class"><div className="selected-class-info"><div className="eyebrow">TURMA {selected.code} <span className={'status-label ' + selected.status}>{statusText[selected.status]}</span></div><h2>{selected.title}</h2><p>{selected.lesson_date ? new Date(selected.lesson_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}</p></div><div className="selected-actions"><button className="btn secondary" onClick={() => setShowQr(!showQr)}>▦ QR Code</button>{selected.status !== 'active' ? <button className="btn primary" onClick={() => changeStatus('active')} disabled={busy}>Ativar avaliação</button> : <button className="btn danger-outline" onClick={() => changeStatus('closed')} disabled={busy}>Encerrar avaliação</button>}</div></div>{showQr && <div className="panel qr-panel"><div><div className="eyebrow">ACESSO DOS PARTICIPANTES</div><h3>Compartilhe o QR Code</h3><p>Os alunos podem apontar a câmera do celular ou acessar o endereço abaixo.</p><a href={examUrl} target="_blank" rel="noreferrer">{examUrl}</a></div><div className="qr-frame"><QRCodeSVG value={examUrl} size={150}/></div></div>}<div className="metrics-grid"><Metric label="Participantes" value={summary?.total ?? 0}/><Metric label="Média da turma" value={Number(summary?.average ?? 0).toFixed(2)}/><Metric label="Maior nota" value={summary?.highest == null ? '—' : Number(summary.highest).toFixed(2)}/><Metric label="Aproveitamento ≥ 7" value={Number(summary?.passRate ?? 0) + '%'}/></div><div className="panel results-panel"><div className="section-heading"><div><div className="eyebrow">ACOMPANHAMENTO</div><h2>Participantes</h2></div><div className="toolbar"><button className="btn secondary" onClick={() => loadDashboard()} disabled={busy}>↻ Atualizar</button><button className="btn danger-outline" onClick={resetResults} disabled={!summary?.total || busy}>Reiniciar resultados</button></div></div>{data?.attempts?.length ? <div className="table-scroll"><table><thead><tr><th>Participante</th><th>Acertos</th><th>Nota</th><th>Envio</th><th></th></tr></thead><tbody>{(data.attempts as Attempt[]).map(attempt => <tr key={attempt.id}><td><b>{attempt.student_name}</b></td><td>{attempt.score}/{attempt.total_questions}</td><td><span className="grade-chip">{Number(attempt.grade).toFixed(2)}</span></td><td>{new Date(attempt.submitted_at).toLocaleString('pt-BR')}</td><td><button className="text-danger" onClick={() => setTarget(attempt)}>Excluir</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><div>◷</div><h3>Aguardando participantes</h3><p>Quando os alunos finalizarem a avaliação, os resultados aparecerão aqui.</p></div>}</div><div className="panel question-stats-panel"><div className="section-heading"><div><div className="eyebrow">VISÃO PEDAGÓGICA</div><h2>Desempenho por questão</h2></div><button className="btn primary" onClick={() => setShowPresentation(true)} disabled={!data?.questions?.length}>Apresentar resultados ↗</button></div>{data?.questionStats?.length ? <div className="stats-grid">{data.questionStats.map((stat: any) => <div className="stat-row" key={stat.position}><b>Q{stat.position}</b><span className="stat-good">Acertos {stat.correct}</span><span className="stat-bad">Erros {stat.wrong}</span><span className="stat-muted">Brancas {stat.unanswered}</span></div>)}</div> : <p className="empty-note">As estatísticas das questões aparecerão após a configuração da avaliação.</p>}</div><div className="panel question-editor"><div className="eyebrow">CONFIGURAÇÃO</div><h2>Questões da avaliação</h2><p>Insira as questões em formato JSON. São permitidas até 20 questões. O gabarito é mantido no servidor.</p><form onSubmit={saveQuestions}><textarea rows={8} value={questionsJson} onChange={e => setQuestionsJson(e.target.value)} placeholder={'[\n  {\n    "prompt": "Enunciado da questão",\n    "options": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],\n    "correctOption": 0,\n    "explanation": "Comentário para o instrutor"\n  }\n]'}/><div className="editor-actions"><small>correctOption: 0 corresponde à primeira alternativa.</small><button className="btn primary" disabled={busy || !questionsJson.trim()}>Salvar questões</button></div></form></div></> : <div className="panel no-selection"><div className="no-selection-art">R</div><div className="eyebrow">RESGATISTA WEB 3.0</div><h2>Seu próximo treinamento começa aqui.</h2><p>Crie uma turma ou selecione uma já cadastrada para configurar avaliações e acompanhar resultados.</p></div>}</section></div>{target && <div className="modal-backdrop"><div className="panel modal-card"><button className="modal-close" onClick={() => setTarget(null)}>×</button><div className="eyebrow">GERENCIAR RESULTADOS</div><h2>Excluir tentativa?</h2><p>Confirma a exclusão do resultado de <b>{target.student_name}</b>?</p><label>PIN administrativo<input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value)} placeholder="6 dígitos"/></label><div className="modal-actions"><button className="btn secondary" onClick={() => setTarget(null)}>Cancelar</button><button className="btn danger" onClick={deleteAttempt} disabled={busy || pin.length !== 6}>Confirmar exclusão</button></div></div></div>}</AppFrame>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); }); const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => setSession(currentSession)); return () => subscription.unsubscribe(); }, []);
  async function logout() { await supabase.auth.signOut(); setSession(null); }
  if (!supabaseUrl || !supabaseKey) return <AppFrame><div className="panel configuration-error"><h1>Configuração necessária</h1><p>Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para conectar a aplicação ao Supabase.</p></div></AppFrame>;
  return <Routes><Route path="/prova/:code" element={<StudentExam/>}/><Route path="*" element={!ready ? <AppFrame><div className="loading-card">Preparando ambiente…</div></AppFrame> : session ? <InstructorDashboard session={session} onLogout={logout}/> : <LoginPage onLogin={setSession}/>} /></Routes>;
}
