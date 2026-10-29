// supabase/functions/upload-receipt/index.ts
//
// Uploads a receipt photo to the "receipts" Storage bucket on behalf of a
// custom-auth user (see src/services/auth.js — there is no Supabase-Auth
// session/JWT for the client to prove identity with directly against
// Storage). This function is the only thing allowed to write into the
// bucket: it validates the caller's (user_id, token) against the `users`
// table itself using the service-role key (which bypasses RLS), then
// performs the upload with that same service-role client. The bucket's own
// RLS policies deny anon/authenticated writes entirely — see
// supabase-migration-custom-auth.sql.
//
// Deploy with: supabase functions deploy upload-receipt
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// the Supabase platform — no manual secret setup needed.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'receipts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, token, fileBase64, contentType, ext } = await req.json();

    if (!user_id || !token || !fileBase64) {
      return new Response(JSON.stringify({ error: 'Missing user_id, token, or fileBase64' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Validate the session the same way the transactions RPCs do.
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', user_id)
      .eq('session_token', token)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    const path = `${user_id}/${Date.now()}.${ext || 'jpg'}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: contentType || 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return new Response(JSON.stringify({ publicUrl: publicUrlData.publicUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Upload failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
