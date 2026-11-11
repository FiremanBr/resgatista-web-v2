import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function readDefaultSecret(name: string, fallbackName?: string) {
  const direct = Deno.env.get(name);
  if (direct) return direct;
  const raw = fallbackName ? Deno.env.get(fallbackName) : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.default ?? null;
  } catch {
    return raw;
  }
}

async function checkPin(db: any, pin: string) {
  const normalized = String(pin ?? "").trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const { data, error } = await db.from("resgatista_v2_admin_config")
    .select("pin_salt,pin_hash,iterations").eq("id", 1).single();
  if (error || !data) throw new Error("Configuração administrativa indisponível.");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(normalized), "PBKDF2", false, ["deriveBits"]
  );
  const salt = Uint8Array.from(atob(data.pin_salt), c => c.charCodeAt(0));
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: Number(data.iterations), hash: "SHA-256" }, key, 256
  ));
  const expected = Uint8Array.from(atob(data.pin_hash), c => c.charCodeAt(0));
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const secret = readDefaultSecret("SUPABASE_SECRET_KEY", "SUPABASE_SECRET_KEYS")
      ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publishable = readDefaultSecret("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEYS")
      ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !secret || !publishable) return reply({ error: "Configuração do servidor incompleta." }, 500);

    const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();
    const action = String(body.action ?? "");

    const requireAdmin = async () => {
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return { error: reply({ error: "Faça login para continuar." }, 401) };
      const userClient = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data.user) return { error: reply({ error: "Sessão inválida. Entre novamente." }, 401) };
      const { data: admin, error: adminError } = await db.from("resgatista_v2_admins")
        .select("user_id").eq("user_id", data.user.id).maybeSingle();
      if (adminError || !admin) return { error: reply({ error: "Usuário sem permissão de instrutor." }, 403) };
      return { user: data.user };
    };

    if (action === "publicExam") {
      const code = String(body.classCode ?? "").trim();
      const { data: cls, error: ce } = await db.from("resgatista_v2_classes")
        .select("id,code,title,status").eq("code", code).eq("status", "active").maybeSingle();
      if (ce || !cls) return reply({ error: "Avaliação não encontrada ou não está ativa." }, 404);
      const { data: questions, error: qe } = await db.from("resgatista_v2_questions")
        .select("id,position,prompt,options").eq("class_id", cls.id).order("position");
      if (qe) throw qe;
      if (!questions?.length) return reply({ error: "Esta avaliação ainda não possui questões." }, 409);
      return reply({ ok: true, class: cls, questions });
    }

    if (action === "submit") {
      const code = String(body.classCode ?? "").trim();
      const name = String(body.studentName ?? "").trim().replace(/\s+/g, " ");
      const answers = body.answers;
      if (name.length < 2 || name.length > 120) return reply({ error: "Informe o nome completo (2 a 120 caracteres)." }, 400);
      const { data: cls, error: ce } = await db.from("resgatista_v2_classes")
        .select("id,code,status").eq("code", code).eq("status", "active").maybeSingle();
      if (ce || !cls) return reply({ error: "Avaliação não encontrada ou encerrada." }, 409);
      const { data: questions, error: qe } = await db.from("resgatista_v2_questions")
        .select("id,position,options,correct_option").eq("class_id", cls.id).order("position");
      if (qe) throw qe;
      if (!questions?.length || questions.length > 20) return reply({ error: "Avaliação sem questões válidas." }, 409);
      if (!Array.isArray(answers) || answers.length !== questions.length) return reply({ error: "Respostas incompletas ou inválidas." }, 400);
      for (let i = 0; i < answers.length; i++) {
        const value = answers[i];
        if (value !== null && (!Number.isInteger(value) || value < 0 || value >= questions[i].options.length)) {
          return reply({ error: "Uma ou mais respostas estão fora das opções disponíveis." }, 400);
        }
      }
      const score = answers.reduce((n: number, value: number | null, i: number) =>
        n + (value === questions[i].correct_option ? 1 : 0), 0);
      const grade = Number((score / questions.length * 10).toFixed(2));
      const { data: saved, error: se } = await db.from("resgatista_v2_attempts").insert({
        class_id: cls.id, student_name: name, answers, score,
        total_questions: questions.length, grade
      }).select("id,score,total_questions,grade,submitted_at").single();
      if (se) throw se;
      return reply({ ok: true, attempt: saved });
    }

    if (action === "listClasses" || action === "dashboard" || action === "saveClass" ||
        action === "saveQuestions" || action === "setClassStatus" ||
        action === "deleteAttempt" || action === "deleteClassAttempts") {
      const auth = await requireAdmin();
      if (auth.error) return auth.error;

      if (action === "listClasses") {
        const { data, error } = await db.from("resgatista_v2_classes")
          .select("id,code,title,lesson_date,status,created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return reply({ ok: true, classes: data ?? [] });
      }

      if (action === "saveClass") {
        const code = String(body.code ?? "").trim();
        const title = String(body.title ?? "").trim();
        if (!/^[A-Za-z0-9._-]{1,30}$/.test(code) || title.length < 2 || title.length > 160) {
          return reply({ error: "Código ou título inválido." }, 400);
        }
        const payload = {
          code, title, lesson_date: body.lessonDate || null,
          created_by: auth.user.id
        };
        let result;
        if (body.id) {
          result = await db.from("resgatista_v2_classes").update(payload)
            .eq("id", body.id).select("id,code,title,lesson_date,status").single();
        } else {
          result = await db.from("resgatista_v2_classes").insert(payload)
            .select("id,code,title,lesson_date,status").single();
        }
        if (result.error) throw result.error;
        return reply({ ok: true, class: result.data });
      }

      if (action === "saveQuestions") {
        const classId = String(body.classId ?? "");
        const items = body.questions;
        if (!Array.isArray(items) || items.length < 1 || items.length > 20) return reply({ error: "A avaliação deve ter entre 1 e 20 questões." }, 400);
        for (const q of items) {
          if (!String(q.prompt ?? "").trim() || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 ||
              !Number.isInteger(q.correctOption) || q.correctOption < 0 || q.correctOption >= q.options.length ||
              q.options.some((v: unknown) => typeof v !== "string" || !v.trim())) {
            return reply({ error: "Revise o enunciado, as alternativas e o gabarito das questões." }, 400);
          }
        }
        const { data: cls, error: ce } = await db.from("resgatista_v2_classes").select("id").eq("id", classId).maybeSingle();
        if (ce || !cls) return reply({ error: "Turma não encontrada." }, 404);

        // Proteção server-side: uma avaliação com respostas não pode ter seu gabarito
        // ou enunciados substituídos, mesmo que alguém chame a API fora da interface.
        const { count: attemptCount, error: attemptError } = await db
          .from("resgatista_v2_attempts")
          .select("id", { count: "exact", head: true })
          .eq("class_id", classId);
        if (attemptError) throw attemptError;
        if ((attemptCount ?? 0) > 0) {
          return reply({
            error: "Esta avaliação já possui tentativas registradas. Para preservar o histórico, crie uma nova turma/avaliação."
          }, 409);
        }

        const { error: de } = await db.from("resgatista_v2_questions").delete().eq("class_id", classId);
        if (de) throw de;
        const rows = items.map((q: any, i: number) => ({
          class_id: classId, position: i + 1, prompt: String(q.prompt).trim(),
          options: q.options.map((v: string) => v.trim()), correct_option: q.correctOption,
          explanation: q.explanation ? String(q.explanation).trim() : null
        }));
        const { error: ie } = await db.from("resgatista_v2_questions").insert(rows);
        if (ie) throw ie;
        return reply({ ok: true, saved: rows.length });
      }

      if (action === "setClassStatus") {
        const status = String(body.status ?? "");
        if (!["planned", "active", "closed"].includes(status)) return reply({ error: "Status inválido." }, 400);
        if (status === "active") {
          const { count, error: qe } = await db.from("resgatista_v2_questions")
            .select("id", { count: "exact", head: true }).eq("class_id", body.classId);
          if (qe) throw qe;
          if (!count) return reply({ error: "Cadastre as questões antes de ativar a avaliação." }, 409);
        }
        const { data, error } = await db.from("resgatista_v2_classes").update({ status })
          .eq("id", body.classId).select("id,code,title,status").single();
        if (error) throw error;
        return reply({ ok: true, class: data });
      }

      if (action === "dashboard") {
        const code = String(body.classCode ?? "").trim();
        const { data: cls, error: ce } = await db.from("resgatista_v2_classes")
          .select("id,code,title,lesson_date,status,created_at").eq("code", code).maybeSingle();
        if (ce || !cls) return reply({ error: "Turma não encontrada." }, 404);
        const [attemptResult, questionResult] = await Promise.all([
          db.from("resgatista_v2_attempts")
            .select("id,student_name,answers,score,total_questions,grade,submitted_at")
            .eq("class_id", cls.id).order("submitted_at", { ascending: false }),
          db.from("resgatista_v2_questions")
            .select("id,position,prompt,options,correct_option,explanation")
            .eq("class_id", cls.id).order("position")
        ]);
        if (attemptResult.error) throw attemptResult.error;
        if (questionResult.error) throw questionResult.error;
        const attempts = attemptResult.data ?? [];
        const questions = questionResult.data ?? [];
        const questionStats = questions.map((q: any, i: number) => {
          const correct = attempts.filter((a: any) => a.answers[i] === q.correct_option).length;
          const unanswered = attempts.filter((a: any) => a.answers[i] === null).length;
          return { position: q.position, correct, wrong: attempts.length - correct - unanswered, unanswered };
        });
        const grades = attempts.map((a: any) => Number(a.grade));
        return reply({
          ok: true, class: cls, attempts, questions, questionStats,
          summary: {
            total: attempts.length,
            average: grades.length ? Number((grades.reduce((a: number, b: number) => a + b, 0) / grades.length).toFixed(2)) : 0,
            highest: grades.length ? Math.max(...grades) : null,
            lowest: grades.length ? Math.min(...grades) : null,
            passRate: grades.length ? Number((grades.filter((g: number) => g >= 7).length / grades.length * 100).toFixed(1)) : 0
          }
        });
      }

      if (action === "deleteAttempt" || action === "deleteClassAttempts") {
        if (!await checkPin(db, String(body.pin ?? ""))) return reply({ error: "PIN administrativo inválido." }, 401);
        if (action === "deleteAttempt") {
          const { data: target, error: te } = await db.from("resgatista_v2_attempts")
            .select("id,student_name").eq("id", body.attemptId).maybeSingle();
          if (te) throw te;
          if (!target) return reply({ error: "Tentativa não encontrada." }, 404);
          if (String(target.student_name).trim() !== String(body.expectedName ?? "").trim()) {
            return reply({ error: "O participante não confere. Exclusão cancelada." }, 409);
          }
          const { data, error } = await db.from("resgatista_v2_attempts").delete()
            .eq("id", target.id).select("id");
          if (error) throw error;
          if ((data ?? []).length !== 1) return reply({ error: "A exclusão não confirmou exatamente um registro." }, 409);
          return reply({ ok: true, deletedCount: 1 });
        }
        const { data, error } = await db.from("resgatista_v2_attempts").delete()
          .eq("class_id", body.classId).select("id");
        if (error) throw error;
        return reply({ ok: true, deletedCount: (data ?? []).length });
      }
    }

    return reply({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("resgatista-v2-api:", error);
    return reply({ error: "Não foi possível processar a solicitação. Tente novamente." }, 500);
  }
});