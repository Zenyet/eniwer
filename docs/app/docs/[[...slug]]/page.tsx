import { source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDXContent = (page.data as any).body;

  return (
    <DocsPage>
      <DocsBody>
        <MDXContent />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams().map(params => ({
    slug: params.slug,
  }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
