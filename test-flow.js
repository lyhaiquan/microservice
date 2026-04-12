const email = `testuser_${Date.now()}@example.com`;
const password = "password123";
const name = "Test User";

async function runFlow() {
    console.log(`\n1. 🛠 Đăng ký tài khoản mới: ${email}`);
    const resReg = await fetch("http://localhost:5050/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name })
    });
    const dataReg = await resReg.json();
    console.log("Response Đăng ký:", dataReg);

    if (!resReg.ok) return console.log("Đăng ký thất bại, dừng test.");

    console.log(`\n2. 🔑 Đăng nhập với tài khoản vừa tạo: ${email}`);
    const resLogin = await fetch("http://localhost:5050/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    const dataLogin = await resLogin.json();
    console.log("Response Đăng nhập:", { message: dataLogin.message, token: dataLogin.token ? "HỢP LỆ (đã ẩn chi tiết dài)" : "KHÔNG CÓ" });

    if (!dataLogin.token) return console.log("Không có token, dừng test.");

    console.log(`\n3. 🛍 Lấy danh sách sản phẩm (đính kèm Bearer Token vào Header)`);
    const resProducts = await fetch("http://localhost:5001/api/products", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${dataLogin.token}`,
            "Content-Type": "application/json"
        }
    });

    const dataProducts = await resProducts.json();
    console.log(`Response Products: Lấy thành công ${dataProducts.length || dataProducts.data?.length || 0} sản phẩm!`);
    
    // In ra phần tử đầu tiên để kiểm duyệt
    const firstProduct = Array.isArray(dataProducts) ? dataProducts[0] : (dataProducts.data ? dataProducts.data[0] : dataProducts);
    console.log("🛒 Mẫu sản phẩm đầu tiên:", JSON.stringify(firstProduct, null, 2));
    
    console.log("\n🎉 Test Flow thành công rực rỡ!");
}

runFlow();
