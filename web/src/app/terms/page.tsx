import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "이용약관",
  description: "버모아(VMOA) 이용약관.",
};

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader title="이용약관" />
      <div className="issue-content">
        <h2>1. 서비스</h2>
        <p>
          버모아(VMOA, 이하 &ldquo;서비스&rdquo;)는 치지직·SOOP·유튜브 등의 공개 정보를 모아 한국 버튜버의 방송 현황,
          데뷔, 소식을 보여주는 비공식 정보 서비스입니다. 각 플랫폼·소속사·크리에이터와 제휴 관계가 없습니다.
        </p>

        <h2>2. 계정</h2>
        <ul>
          <li>회원가입은 만 14세 이상만 할 수 있습니다.</li>
          <li>구글 계정으로 로그인하며, 언제든 내 페이지에서 탈퇴할 수 있습니다. 탈퇴하면 계정과 관련 데이터는 바로 삭제됩니다.</li>
        </ul>

        <h2>3. 금지 행위</h2>
        <ul>
          <li>다른 사람을 비방하거나 사생활·개인정보를 노출하는 행위</li>
          <li>타인의 권리를 침해하거나 법령에 어긋나는 행위</li>
          <li>도배, 자동화된 대량 요청 등 서비스 운영을 방해하는 행위</li>
        </ul>
        <p>위 행위가 확인되면 해당 내용을 숨기거나 계정 이용을 제한할 수 있습니다.</p>

        <h2>4. 정보의 정확성</h2>
        <p>
          방송·순위 정보는 수집 시점 기준이며 실제와 다를 수 있습니다. 이슈와 데뷔 소식 일부는 공개 자료를 바탕으로 AI가
          정리한 것으로, 정확한 내용은 함께 표시된 출처의 원문을 확인해 주세요.
        </p>

        <h2>5. 권리 침해 신고</h2>
        <p>
          채널·방송의 권리는 각 크리에이터와 플랫폼에 있습니다. 서비스의 내용이 명예훼손이나 저작권 침해 등 권리를 침해한다고
          판단되면 <a href="/contact">문의</a>로 해당 주소와 사유를 알려주세요. 확인 후 지체 없이 숨김 등의 조치를 합니다.
        </p>

        <h2>6. YouTube</h2>
        <p>
          서비스는 YouTube API 서비스를 사용합니다. 서비스에서 유튜브 영상을 보거나 유튜브 정보를 이용하면{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
            YouTube 서비스 약관
          </a>
          에 동의하는 것으로 봅니다. 영상과 채널 정보의 출처는 YouTube 이며, 버모아의 분류·태그·투표 결과는 YouTube 가
          아닌 버모아 자체 정보입니다.
        </p>

        <h2>7. 변경</h2>
        <p>서비스와 본 약관은 변경될 수 있으며, 약관이 바뀌면 이 페이지에 공지합니다.</p>
      </div>
    </div>
  );
}
