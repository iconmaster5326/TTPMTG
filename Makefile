Textures/manual.pdf: Manual/manual.html
	pandoc Manual/manual.html -o Textures/manual.pdf -t html -c Manual/manual.css
