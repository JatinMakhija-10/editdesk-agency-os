// Optional Supabase Edge Function for Cloud Mode (matches README.md & PRODUCT_SPEC.md)
// Deploy with: supabase functions deploy ai-command
// Secrets: OPENAI_API_KEY, optional OPENAI_MODEL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: isOwner, error: ownerErr } = await supabase.rpc('is_owner');
    if (ownerErr || !isOwner) {
      return new Response(JSON.stringify({ error: 'Owner authentication required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { text, contextSummary } = await req.json();
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'You draft agency orders, client payments, editor payouts, expenses, or answer queries for EditDesk (INR). Never invent missing values. Return JSON {intent, answer, warnings, drafts}.',
          },
          { role: 'user', content: `Context:\n${contextSummary || ''}\n\nCommand:\n${text}` },
        ],
      }),
    });

    const result = await resp.json();
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || '{}');
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
