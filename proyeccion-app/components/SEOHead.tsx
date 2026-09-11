import React, { useEffect } from "react";
import Head from "expo-router/head";
import { Platform } from "react-native";

export interface SEOHeadProps {
  title: string;
  description: string;
  pathname?: string;
  ogImage?: string;
  noIndex?: boolean;
  ogType?: "website" | "article";
}

const DEFAULT_ORIGIN = "https://cines.vacaslocas.com.ar";
const DEFAULT_OG_IMAGE = "/og-image.jpg";

export default function SEOHead({
  title,
  description,
  pathname = "/",
  ogImage = DEFAULT_OG_IMAGE,
  noIndex = false,
  ogType = "website",
}: SEOHeadProps) {
  // En navegadores web, asegurar sincronización directa en tiempo de ejecución (SPA client-side navigation)
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.title = title;

      // Meta description
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute("content", description);

      // Canonical link
      const origin = window.location.origin || DEFAULT_ORIGIN;
      const canonicalHref = `${origin}${pathname}`;
      let linkCanonical = document.querySelector('link[rel="canonical"]');
      if (!linkCanonical) {
        linkCanonical = document.createElement("link");
        linkCanonical.setAttribute("rel", "canonical");
        document.head.appendChild(linkCanonical);
      }
      linkCanonical.setAttribute("href", canonicalHref);

      // Meta robots
      let metaRobots = document.querySelector('meta[name="robots"]');
      if (!metaRobots) {
        metaRobots = document.createElement("meta");
        metaRobots.setAttribute("name", "robots");
        document.head.appendChild(metaRobots);
      }
      metaRobots.setAttribute("content", noIndex ? "noindex, nofollow" : "index, follow");

      // Open Graph Tags
      const ogTags: Record<string, string> = {
        "og:title": title,
        "og:description": description,
        "og:url": canonicalHref,
        "og:type": ogType,
        "og:image": ogImage.startsWith("http") ? ogImage : `${origin}${ogImage.startsWith("/") ? "" : "/"}${ogImage}`,
        "twitter:title": title,
        "twitter:description": description,
        "twitter:card": "summary_large_image",
      };

      Object.entries(ogTags).forEach(([property, content]) => {
        const isTwitter = property.startsWith("twitter:");
        const selector = isTwitter
          ? `meta[name="${property}"]`
          : `meta[property="${property}"]`;
        let metaTag = document.querySelector(selector);
        if (!metaTag) {
          metaTag = document.createElement("meta");
          if (isTwitter) {
            metaTag.setAttribute("name", property);
          } else {
            metaTag.setAttribute("property", property);
          }
          document.head.appendChild(metaTag);
        }
        metaTag.setAttribute("content", content);
      });
    }
  }, [title, description, pathname, ogImage, noIndex, ogType]);

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : (process.env.EXPO_PUBLIC_SITE_URL || DEFAULT_ORIGIN);

  const canonicalUrl = `${origin}${pathname}`;
  const fullOgImageUrl = ogImage.startsWith("http")
    ? ogImage
    : `${origin}${ogImage.startsWith("/") ? "" : "/"}${ogImage}`;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullOgImageUrl} />
      <meta property="og:image:width" content="1376" />
      <meta property="og:image:height" content="768" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:site_name" content="Cines - Sistema de Gestión de Proyección" />
      <meta property="og:locale" content="es_AR" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullOgImageUrl} />
      <meta name="twitter:image:alt" content={title} />
    </Head>
  );
}
