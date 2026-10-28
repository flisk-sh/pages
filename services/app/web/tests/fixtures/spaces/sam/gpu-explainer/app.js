fetch("data.json")
	.then((r) => r.json())
	.then((d) => {
		document.getElementById("cores").textContent = d.cores;
	});
