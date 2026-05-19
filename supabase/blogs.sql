-- =============================================================================
-- Supabase setup for portfolio blog (static site + public read-only access)
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1) Create blogs table
CREATE TABLE IF NOT EXISTS public.blogs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  excerpt     TEXT,
  content     TEXT,
  tags        TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  cover_image TEXT
);

-- Helpful index for listing (newest first)
CREATE INDEX IF NOT EXISTS blogs_created_at_idx ON public.blogs (created_at DESC);

-- 2) Enable Row Level Security
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;

-- 3) Public read-only policy (anon + authenticated can SELECT)
DROP POLICY IF EXISTS "Public read access for blogs" ON public.blogs;

CREATE POLICY "Public read access for blogs"
  ON public.blogs
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- =============================================================================
-- 4) Sample dummy data
-- =============================================================================
INSERT INTO public.blogs (title, slug, excerpt, content, tags, cover_image, created_at)
VALUES
(
  'Getting Started with ASP.NET Web API',
  'getting-started-aspnet-web-api',
  'A beginner''s guide to building robust RESTful APIs using ASP.NET Web API, including best practices and real-world examples.',
  '<p>ASP.NET Web API is a powerful framework for building HTTP services that can be accessed from any client, including browsers and mobile devices.</p>
   <h2>Why Use ASP.NET Web API?</h2>
   <ul>
     <li>Easy to build RESTful services</li>
     <li>Supports multiple formats (JSON, XML, etc.)</li>
     <li>Seamless integration with the .NET ecosystem</li>
   </ul>
   <h2>Getting Started</h2>
   <ol>
     <li>Install Visual Studio and create a new ASP.NET Web API project.</li>
     <li>Define your models and controllers.</li>
     <li>Configure routing in <code>WebApiConfig.cs</code>.</li>
     <li>Test your API using Postman or Swagger.</li>
   </ol>
   <p>With these basics, you can start building robust APIs for your applications.</p>',
  ARRAY['ASP.NET', 'Web API', 'Backend', 'Tutorial'],
  'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=900&q=80',
  '2024-05-15T10:00:00+00:00'
),
(
  'Integrating WhatsApp with Your Website',
  'integrating-whatsapp-with-your-website',
  'Learn how to connect your website to WhatsApp Business API for seamless customer communication and automation.',
  '<p>WhatsApp Business API enables automated messaging, notifications, and customer support directly from your web application.</p>
   <h2>Key Benefits</h2>
   <ul>
     <li>Higher open rates than email</li>
     <li>Real-time two-way communication</li>
     <li>Rich media support</li>
   </ul>
   <p>Start with a verified business account and a reliable API provider to integrate safely at scale.</p>',
  ARRAY['WhatsApp', 'API', 'Integration'],
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=900&q=80',
  '2024-04-10T10:00:00+00:00'
),
(
  'Best Practices for SQL Server Database Design',
  'sql-server-database-design-best-practices',
  'Tips and techniques for designing efficient, scalable, and secure databases with Microsoft SQL Server.',
  '<p>Good database design is the foundation of performant backend systems. These practices help you avoid costly rework later.</p>
   <h2>Core Principles</h2>
   <ul>
     <li>Normalize first, denormalize when metrics prove it</li>
     <li>Index foreign keys and frequent filter columns</li>
     <li>Use appropriate data types and constraints</li>
   </ul>
   <p>Document your schema and review query plans as data volume grows.</p>',
  ARRAY['SQL Server', 'Database', 'Backend'],
  'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=900&q=80',
  '2024-03-05T10:00:00+00:00'
)
ON CONFLICT (slug) DO NOTHING;
