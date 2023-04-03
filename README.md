# DDR's __Stardust__

Minimal reproduction of weird console.log error for https://bugzilla.mozilla.org/show_bug.cgi?id=1613424.

Serve with `./example_server.py` and visit http://127.0.0.1:8080/ to reproduce.

![image](https://user-images.githubusercontent.com/862627/229399158-37db685b-5f8e-4b5a-accb-b4e35fd28b23.png)

Expected console output
---
```js
a ArrayBuffer(10)
b SharedArrayBuffer(10)
```

Actual console output
---
- Firefox 111.0.1:
	```js
	a ArrayBuffer(10)
	```
- Chrome 111.0.5563.110:
	```js
	a ArrayBuffer(10)
	b SharedArrayBuffer(10)
	```
