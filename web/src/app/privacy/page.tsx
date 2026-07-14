import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "버모아(VMOA)의 개인정보처리방침 및 쿠키·광고 관련 고지.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader title="개인정보처리방침" />
      <div className="issue-content">
        <p>
          버모아(VMOA, 이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를
          중요하게 생각합니다. 본 방침은 서비스가 수집하는 정보와 그 처리에 대해
          설명합니다.
        </p>

        <h2>1. 수집하는 정보</h2>
        <p>
          서비스는 회원가입 없이 이용 가능하며, 이름·연락처 등 개인을 식별할 수
          있는 정보를 직접 수집하지 않습니다. 다만 서비스 운영·통계·오류 분석을
          위해 접속 로그, 브라우저 종류, 기기 정보 등 비식별 정보가 자동으로
          기록될 수 있습니다.
        </p>

        <h2>2. 쿠키 및 광고</h2>
        <p>
          서비스는 Google AdSense 등 제3자 광고를 게재할 수 있습니다. Google을
          비롯한 제3자 광고 사업자는 쿠키를 사용해 이용자의 방문 기록에 기반한
          맞춤형 광고를 제공할 수 있습니다.
        </p>
        <ul>
          <li>
            Google의 광고 쿠키 사용은{" "}
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 광고 정책
            </a>
            을 따릅니다.
          </li>
          <li>
            이용자는{" "}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 광고 설정
            </a>
            에서 맞춤 광고를 비활성화할 수 있습니다.
          </li>
          <li>브라우저 설정에서 쿠키를 차단·삭제할 수 있습니다.</li>
        </ul>

        <h2>3. 제3자 데이터</h2>
        <p>
          서비스가 표시하는 방송 현황은 각 플랫폼의 공개 정보를 집계한 것으로,
          해당 정보의 권리는 각 플랫폼과 크리에이터에게 있습니다.
        </p>

        <h2>4. 정보의 수정·삭제</h2>
        <p>
          표시된 채널·방송 정보의 수정·삭제를 원하시면{" "}
          <a href="/contact">문의</a>를 통해 요청하실 수 있습니다.
        </p>

        <h2>5. 방침 변경</h2>
        <p>
          본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 변경 시 본
          페이지를 통해 공지합니다.
        </p>
      </div>
    </div>
  );
}
