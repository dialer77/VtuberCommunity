import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "문의",
  description: "버모아(VMOA) 제휴·정보 수정·삭제 요청 등 문의 안내.",
};

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contact@example.com";

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="문의"
        description="제휴, 정보 수정·삭제, 버그 제보 등 무엇이든 환영합니다."
      />
      <div className="issue-content">
        <p>아래 항목은 이메일로 연락 주세요.</p>
        <ul>
          <li>표시된 채널·방송 정보의 수정·삭제 요청</li>
          <li>버튜버 추가 등록 요청</li>
          <li>제휴·광고 문의</li>
          <li>오류·버그 제보</li>
        </ul>
        <p>
          이메일:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p className="text-sm text-muted-2">
          ※ 연락처는 운영자 실제 이메일로 교체하세요
          (<code>NEXT_PUBLIC_CONTACT_EMAIL</code> 환경변수).
        </p>
      </div>
    </div>
  );
}
