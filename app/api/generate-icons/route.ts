import { NextResponse } from 'next/server';

export async function GET() {
  // 간단한 SVG 아이콘 생성
  const svgIcon = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#3B82F6"/>
      <circle cx="256" cy="256" r="150" fill="white"/>
      <text x="256" y="300" font-family="Arial" font-size="150" font-weight="bold" text-anchor="middle" fill="#3B82F6">W</text>
    </svg>
  `;

  return new NextResponse(svgIcon, {
    headers: {
      'Content-Type': 'image/svg+xml',
    },
  });
}