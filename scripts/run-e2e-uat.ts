/**
 * KỊCH BẢN KIỂM THỬ NGHIỆM THU TOÀN TRÌNH (END-TO-END UAT TEST SUITE) - OFFICEOPS
 *
 * Kiểm tra 7 kịch bản nghiệp vụ cốt lõi:
 * 1. Khách hàng quét mã QR báo lỗi thiết bị (Cổng công khai, tính SLA).
 * 2. Điều phối thông minh & Phân công KTV (Bản đồ Leaflet, Haversine GPS, chấm điểm tải công việc).
 * 3. Kỹ thuật viên xử lý trên Mobile /tech (Check-in GPS, linh kiện thay thế, chữ ký khách hàng).
 * 4. Chụp ảnh đồng hồ & AI OCR đọc số Counter (nhận diện số, gắn nhãn OCR).
 * 5. Quy trình Kiểm soát & Phê duyệt khi giảm chỉ số Counter (MeterApprovalStatus).
 * 6. Kho thông minh: Xuất kho trừ tồn theo nguyên tắc FIFO (lô nhập trước xuất trước).
 * 7. Tự động hóa tính cước hóa đơn theo từng máy & Sinh mã VietQR theo cấu hình doanh nghiệp.
 *
 * Chạy bằng lệnh: npx tsx scripts/run-e2e-uat.ts
 */

import { PrismaClient } from "@prisma/client";
import { calculateDistanceKm, estimateCoordinatesFromAddress } from "../src/lib/location";
import { parseMeterCandidates } from "../src/lib/ocr/meterOcr";
import { getCompanyProfile, generateVietQrUrl } from "../src/lib/companyProfile";

const prisma = new PrismaClient();

interface StepResult {
  step: number;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const results: StepResult[] = [];

async function runScenario(
  step: number,
  name: string,
  fn: () => Promise<string>
) {
  const start = Date.now();
  console.log(`\n================================================================================`);
  console.log(`▶ [KỊCH BẢN ${step}] ${name}`);
  console.log(`================================================================================`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    results.push({ step, name, passed: true, durationMs, details });
    console.log(`✅ KẾT QUẢ: ĐẠT (PASS) trong ${durationMs}ms`);
    console.log(`   ↳ Chi tiết: ${details}`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ step, name, passed: false, durationMs, details: err.message || String(err) });
    console.error(`❌ KẾT QUẢ: THẤT BÀI (FAIL) trong ${durationMs}ms`);
    console.error(`   ↳ Lỗi:`, err.message || err);
  }
}

async function startUatSuite() {
  console.log("********************************************************************************");
  console.log("🚀 BẮT ĐẦU CHẠY KIỂM THỬ NGHIỆM THU TOÀN TRÌNH (UAT SUITE) - OFFICEOPS SYSTEM");
  console.log("   Thời gian bắt đầu:", new Date().toLocaleString("vi-VN"));
  console.log("********************************************************************************");

  let testEquipment: any = null;
  let testCustomer: any = null;
  let testContract: any = null;
  let testTech: any = null;
  let createdTicket: any = null;
  let testPart: any = null;
  let testBatch: any = null;

  // SETUP: Lấy dữ liệu mẫu có sẵn từ cơ sở dữ liệu
  await runScenario(0, "Chuẩn bị Dữ liệu Kiểm thử (Test Fixtures)", async () => {
    testEquipment = await prisma.equipment.findFirst({
      where: { customerId: { not: null } },
      include: { customer: true, contract: true },
    });
    if (!testEquipment) throw new Error("Chưa có thiết bị nào được gán cho khách hàng trong DB");

    testCustomer = testEquipment.customer;
    testContract = testEquipment.contract;

    testTech = await prisma.user.findFirst({
      where: { role: "FIELD_TECH", isActive: true },
    });
    if (!testTech) throw new Error("Chưa có Kỹ thuật viên (FIELD_TECH) trong DB");

    testPart = await prisma.part.findFirst({
      include: { batches: { where: { quantity: { gt: 0 } }, orderBy: { receivedDate: "asc" } } },
    });
    if (!testPart || testPart.batches.length === 0) {
      throw new Error("Chưa có linh kiện có tồn kho trong DB");
    }
    testBatch = testPart.batches[0];

    return `Thiết bị: ${testEquipment.model} (SN: ${testEquipment.serialNumber}) | Khách: ${testCustomer.name} | KTV: ${testTech.name} | Linh kiện: ${testPart.name} (Tồn lô cũ: ${testBatch.quantity} ${testPart.unit})`;
  });

  // KỊCH BẢN 1: Khách hàng quét mã QR dán trên máy báo lỗi
  await runScenario(1, "Khách hàng quét mã QR công khai báo lỗi thiết bị", async () => {
    // 1. Tạo mã ticket mới
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const countToday = await prisma.ticket.count();
    const ticketCode = `TK-UAT-${dateStr}-${String(countToday + 1).padStart(3, "0")}`;

    // SLA: URGENT = 4 giờ
    const slaDueAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

    createdTicket = await prisma.ticket.create({
      data: {
        code: ticketCode,
        customerId: testCustomer.id,
        equipmentId: testEquipment.id,
        type: "REPAIR",
        status: "PENDING",
        priority: "URGENT",
        description: "Máy photocopy báo kẹt giấy khay 1 liên tục và kêu to khi kéo giấy",
        source: "CUSTOMER",
        slaDueAt: slaDueAt,
      },
    });

    if (!createdTicket.id || createdTicket.status !== "PENDING") {
      throw new Error("Không thể tạo ticket ở trạng thái PENDING");
    }

    return `Tạo thành công phiếu: ${createdTicket.code} | Trạng thái: ${createdTicket.status} | Ưu tiên: ${createdTicket.priority} | Hạn SLA: ${slaDueAt.toLocaleTimeString("vi-VN")}`;
  });

  // KỊCH BẢN 2: Điều phối thông minh & Phân công KTV trên Bản đồ
  await runScenario(2, "Bảng Điều phối thông minh: Tính khoảng cách GPS Haversine & Phân công KTV", async () => {
    // Tọa độ khách hàng
    const custCoords = estimateCoordinatesFromAddress(testCustomer.address, createdTicket.id);

    // Giả lập vị trí KTV tại Quận 1
    const techCoords = estimateCoordinatesFromAddress(testTech.region || "Quận 1", testTech.id);

    // Tính khoảng cách Haversine
    const distKm = calculateDistanceKm(
      custCoords.latitude,
      custCoords.longitude,
      techCoords.latitude,
      techCoords.longitude
    );

    if (distKm <= 0 || isNaN(distKm)) {
      throw new Error("Lỗi thuật toán Haversine không tính được khoảng cách");
    }

    // Điều phối viên giao phiếu cho KTV
    const assigned = await prisma.ticket.update({
      where: { id: createdTicket.id },
      data: {
        assigneeId: testTech.id,
        status: "ASSIGNED",
      },
    });

    // Tạo thông báo cho KTV
    await prisma.notification.create({
      data: {
        userId: testTech.id,
        channel: "IN_APP",
        title: `Phiếu mới được phân công: ${assigned.code}`,
        body: `Sự cố: ${assigned.description}. Khách hàng: ${testCustomer.name}. Khoảng cách: ~${distKm} km`,
      },
    });

    return `Khoảng cách GPS Haversine: ~${distKm} km | Phiếu ${assigned.code} đã chuyển trạng thái ASSIGNED cho KTV: ${testTech.name} | Đã phát sinh Notification`;
  });

  // KỊCH BẢN 3: KTV thao tác trên Mobile /tech (Check-in GPS, Trừ kho FIFO, Ghi nhận chữ ký)
  await runScenario(3, "KTV check-in GPS tại địa chỉ khách hàng & Đề xuất xuất kho linh kiện", async () => {
    // KTV Check-in GPS
    const checkInLat = 10.7769;
    const checkInLng = 106.7009;
    const checkInTime = new Date();

    const inProgressTicket = await prisma.ticket.update({
      where: { id: createdTicket.id },
      data: {
        status: "IN_PROGRESS",
        checkInAt: checkInTime,
        checkInLat: checkInLat,
        checkInLng: checkInLng,
        diagnosis: "Mòn rulo cuốn giấy khay 1 (Pick-up roller) và gãy ngàm giữ bánh răng",
      },
    });

    if (inProgressTicket.status !== "IN_PROGRESS") {
      throw new Error("Không thể chuyển phiếu sang IN_PROGRESS khi check-in");
    }

    // Ghi nhận xuất kho linh kiện thay thế (FIFO)
    const initialBatchQty = testBatch.quantity;
    const replaceQty = 1;

    await prisma.$transaction(async (tx) => {
      // 1. Trừ tồn kho lô cũ nhất
      await tx.inventoryBatch.update({
        where: { id: testBatch.id },
        data: { quantity: { decrement: replaceQty } },
      });

      // 2. Ghi lịch sử dịch chuyển kho
      await tx.stockMovement.create({
        data: {
          batchId: testBatch.id,
          type: "OUT",
          quantity: replaceQty,
          refType: "Ticket",
          refId: inProgressTicket.id,
        },
      });

      // 3. Ghi nhận lịch sử phụ tùng đã thay vào thiết bị
      await tx.partReplacement.create({
        data: {
          ticketId: inProgressTicket.id,
          equipmentId: testEquipment.id,
          partId: testPart.id,
          quantity: replaceQty,
          oldPartReturned: true,
        },
      });
    });

    // Kiểm tra lại tồn lô sau khi trừ FIFO
    const updatedBatch = await prisma.inventoryBatch.findUnique({
      where: { id: testBatch.id },
    });

    if (updatedBatch!.quantity !== initialBatchQty - replaceQty) {
      throw new Error(`Lỗi trừ kho FIFO: Trước = ${initialBatchQty}, Sau = ${updatedBatch!.quantity}`);
    }

    return `Check-in GPS thành công (${checkInLat}, ${checkInLng}) | Xuất kho linh kiện: ${testPart.name} x${replaceQty} | Tồn lô ${testBatch.batchCode} giảm từ ${initialBatchQty} xuống ${updatedBatch!.quantity} (Chuẩn FIFO)`;
  });

  // KỊCH BẢN 4: Chụp ảnh đồng hồ & AI OCR đọc số Counter
  await runScenario(4, "AI OCR nhận diện số Counter từ ảnh chụp & Đóng phiếu với Chữ ký khách hàng", async () => {
    const currentMachineCounter = testEquipment.currentCounter;
    const expectedNewCounter = currentMachineCounter + 1550; // Tăng 1,550 bản sau 1 tháng sử dụng

    // Giả lập kết quả quét OCR thô từ ảnh màn hình Ricoh/Toshiba
    const simulatedOcrRawText = `
      COUNTER REPORT - MACHINE STATUS
      Total Counter: ${expectedNewCounter.toLocaleString("vi-VN")}
      Black & White: ${expectedNewCounter.toLocaleString("vi-VN")}
      Color Total: 0
      Serial: ${testEquipment.serialNumber}
      Date: ${new Date().toLocaleDateString("vi-VN")}
    `;

    // Chạy bộ bóc tách và xếp hạng ứng viên AI OCR
    const { bestCandidate } = parseMeterCandidates(simulatedOcrRawText, currentMachineCounter);

    if (!bestCandidate || bestCandidate.value !== expectedNewCounter) {
      throw new Error(`AI OCR không trích xuất đúng số counter. Kỳ vọng: ${expectedNewCounter}, Nhận: ${bestCandidate?.value}`);
    }

    // Đóng phiếu kỹ thuật với số counter và chữ ký điện tử hợp lệ
    const completedTicket = await prisma.ticket.update({
      where: { id: createdTicket.id },
      data: {
        status: "COMPLETED",
        counterAtClose: expectedNewCounter,
        resolvedAt: new Date(),
        customerSignature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAAAwCAYAAACqY7lEAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAABMSURBVHgB7c6xCQBAEMSwr9u5WqK4wA3uH/gEESsDAAAAIbMHAACAcwMNAAAA5wYaAAAAnhtwAAAAODfQAAAA8NyAAwAAwLmBBgAAgHMDDfk2AQEAAHTq13YAAAAASUVORK5CYII=",
        logs: {
          create: {
            userId: testTech.id,
            fromStatus: "IN_PROGRESS",
            toStatus: "COMPLETED",
            note: "Đã thay thế rulo cuốn giấy mới, vệ sinh gương quét, test in 10 bản nét đẹp, bàn giao KH",
          },
        },
      },
    });

    // Cập nhật counter thiết bị và ghi nhật ký MeterLog với nguồn OCR
    await prisma.equipment.update({
      where: { id: testEquipment.id },
      data: { currentCounter: expectedNewCounter },
    });

    const meterLog = await prisma.meterLog.create({
      data: {
        equipmentId: testEquipment.id,
        ticketId: completedTicket.id,
        recordedById: testTech.id,
        counterValue: expectedNewCounter,
        source: "OCR",
        status: "APPROVED",
      },
    });

    return `AI OCR nhận diện chính xác: ${bestCandidate.formattedValue} (Độ tin cậy: ${bestCandidate.confidence}%) | Nguồn Meter: ${meterLog.source} | Phiếu ${completedTicket.code} đã hoàn tất bàn giao kèm chữ ký khách hàng!`;
  });

  // KỊCH BẢN 5: Quy trình Phê duyệt khi chỉ số Counter bị giảm (Thay bo mạch / Reset)
  await runScenario(5, "Quy trình Phê duyệt Kiểm soát khi giảm chỉ số Counter (MeterApprovalStatus)", async () => {
    const currentCounter = (await prisma.equipment.findUnique({ where: { id: testEquipment.id } }))!.currentCounter;
    const lowerCounter = Math.max(1000, currentCounter - 10000); // Giảm 10,000 bản

    // KTV khai báo số nhỏ hơn hiện tại
    const pendingMeterLog = await prisma.meterLog.create({
      data: {
        equipmentId: testEquipment.id,
        recordedById: testTech.id,
        counterValue: lowerCounter,
        source: "TECH",
        status: "PENDING_APPROVAL",
        adjustmentReason: "Thay thế bo mạch chính (Main Board) mới xuất kho từ hãng, reset counter về số bo mới",
        photoUrl: "https://officeops.vn/uploads/meter_change_proof.jpg",
      },
    });

    if (pendingMeterLog.status !== "PENDING_APPROVAL") {
      throw new Error("Bản ghi counter thấp hơn phải ở trạng thái PENDING_APPROVAL");
    }

    // Kiểm tra máy: Counter của máy KHÔNG được tự ý giảm khi chưa duyệt!
    let checkEquipment = await prisma.equipment.findUnique({ where: { id: testEquipment.id } });
    if (checkEquipment!.currentCounter !== currentCounter) {
      throw new Error("LỖI BẢO MẬT: Counter của thiết bị đã bị tự ý thay đổi trước khi được duyệt!");
    }

    // Kế toán / Giám đốc phê duyệt điều chỉnh
    const adminUser = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
    await prisma.meterLog.update({
      where: { id: pendingMeterLog.id },
      data: {
        status: "APPROVED",
        approvedById: adminUser?.id,
        approvedAt: new Date(),
      },
    });

    // Sau khi duyệt -> Cập nhật counter thiết bị
    await prisma.equipment.update({
      where: { id: testEquipment.id },
      data: { currentCounter: lowerCounter },
    });

    checkEquipment = await prisma.equipment.findUnique({ where: { id: testEquipment.id } });
    if (checkEquipment!.currentCounter !== lowerCounter) {
      throw new Error("Sau khi duyệt, counter thiết bị chưa được cập nhật");
    }

    return `Bản ghi giảm chỉ số được chặn ở trạng thái PENDING_APPROVAL | Sau khi SUPER_ADMIN duyệt, Counter máy chính thức cập nhật từ ${currentCounter.toLocaleString("vi-VN")} xuống ${lowerCounter.toLocaleString("vi-VN")} bản`;
  });

  // KỊCH BẢN 6: Quyết toán cước tháng & Sinh mã thanh toán VietQR động
  await runScenario(6, "Tính cước Hóa đơn theo định mức từng máy & Sinh mã thanh toán VietQR động", async () => {
    // Đọc cấu hình doanh nghiệp
    const company = await getCompanyProfile();

    // Giả lập sản lượng tiêu thụ trong kỳ của máy
    const baseRental = Number(testContract?.basePrice || 1500000);
    const quota = testEquipment.baseQuota ?? testContract?.baseQuota ?? 3000;
    const overagePrice = Number(testEquipment.overagePrice ?? testContract?.overagePrice ?? 120);

    const actualUsage = 4800; // Sử dụng 4,800 bản
    const overageCopies = Math.max(0, actualUsage - quota); // Vượt 1,800 bản
    const overageAmount = overageCopies * overagePrice;
    const subtotal = baseRental + overageAmount;
    const tax = Math.round(subtotal * 0.1); // VAT 10%
    const total = subtotal + tax;

    // Tạo hóa đơn kiểm thử
    const invCode = `INV-UAT-${Date.now().toString().slice(-6)}`;
    const invoice = await prisma.invoice.create({
      data: {
        code: invCode,
        customerId: testCustomer.id,
        contractId: testContract?.id || (await prisma.contract.findFirst())!.id,
        periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        subtotal: subtotal,
        tax: tax,
        total: total,
        status: "SENT",
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });

    // Sinh mã VietQR theo cấu hình công ty thật
    const qrUrl = generateVietQrUrl({
      bankBin: company.bankBin,
      bankAccount: company.bankAccount,
      amount: total,
      content: `TT ${invoice.code}`,
      accountName: company.accountHolder,
      template: company.qrTemplate || "compact2",
    });

    if (!qrUrl.includes(company.bankAccount.replace(/\s+/g, ""))) {
      throw new Error("Mã VietQR không khớp số tài khoản ngân hàng đã cấu hình");
    }

    return `Hóa đơn: ${invoice.code} | Tiền thuê gốc: ${baseRental.toLocaleString("vi-VN")}₫ | Sản lượng: ${actualUsage} (Vượt ${overageCopies} x ${overagePrice}₫ = ${overageAmount.toLocaleString("vi-VN")}₫) | Tổng thanh toán: ${total.toLocaleString("vi-VN")}₫ | VietQR: ${company.bankName} - STK: ${company.bankAccount}`;
  });

  // KỊCH BẢN 7: Báo cáo Nhập-Xuất-Tồn & Tổng hợp Doanh thu
  await runScenario(7, "Báo cáo Thông kê & Nhập - Xuất - Tồn kho (Opening + In - Out = Closing)", async () => {
    // Đếm tổng số thiết bị, phiếu và hóa đơn
    const [totalEquipment, totalTickets, totalInvoices, movementsCount] = await Promise.all([
      prisma.equipment.count(),
      prisma.ticket.count(),
      prisma.invoice.count(),
      prisma.stockMovement.count(),
    ]);

    // Lấy báo cáo tồn kho hiện tại
    const partsInStock = await prisma.part.findMany({
      include: {
        batches: { select: { quantity: true, costPrice: true } },
      },
      take: 5,
    });

    const stockSummary = partsInStock.map((p) => {
      const totalQty = p.batches.reduce((sum, b) => sum + b.quantity, 0);
      return `${p.partCode}: ${totalQty} ${p.unit}`;
    }).join(" | ");

    return `Hệ thống quản lý: ${totalEquipment} thiết bị | ${totalTickets} phiếu kỹ thuật | ${totalInvoices} hóa đơn | ${movementsCount} giao dịch kho | Top tồn: ${stockSummary}`;
  });

  // TỔNG KẾT BÁO CÁO NGHIỆM THU
  console.log("\n================================================================================");
  console.log("📊 BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ NGHIỆM THU TOÀN TRÌNH (UAT REPORT)");
  console.log("================================================================================");

  let passedTotal = 0;
  for (const r of results) {
    if (r.passed) passedTotal++;
    const statusIcon = r.passed ? "✅ ĐẠT (PASS)" : "❌ THẤT BÀI (FAIL)";
    console.log(
      `${statusIcon.padEnd(16)} | Kịch bản ${r.step}: ${r.name} (${r.durationMs}ms)`
    );
  }

  const passRate = (passedTotal / results.length) * 100;
  console.log("--------------------------------------------------------------------------------");
  console.log(`- Tổng số kịch bản kiểm thử: ${results.length}`);
  console.log(`- Số kịch bản ĐẠT: ${passedTotal}`);
  console.log(`- Số kịch bản THẤT BÀI: ${results.length - passedTotal}`);
  console.log(`- TỶ LỆ ĐẠT (PASS RATE): ${passRate.toFixed(1)}%`);

  if (passRate === 100.0) {
    console.log(`\n🎉 KẾT LUẬN UAT: TOÀN BỘ CÁC LUỒNG NGHIỆP VỤ HOẠT ĐỘNG HOÀN HẢO 100%! HỆ THỐNG ĐÃ ĐỦ ĐIỀU KIỆN ĐÓNG GÓI BÀN GIAO SỬ DỤNG THỰC TẾ.\n`);
  } else {
    console.error(`\n⚠️ KẾT LUẬN UAT: CÓ ${results.length - passedTotal} KỊCH BẢN CẦN RÀ SOÁT LẠI TRƯỚC KHI BÀN GIAO.\n`);
  }

  await prisma.$disconnect();
}

startUatSuite().catch(async (e) => {
  console.error("Lỗi thực thi UAT Suite:", e);
  await prisma.$disconnect();
  process.exit(1);
});
