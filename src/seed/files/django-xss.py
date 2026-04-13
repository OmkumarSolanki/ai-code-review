from django.http import HttpResponse
from django.utils.safestring import mark_safe
from django.shortcuts import render

def user_profile(request):
    name = request.GET.get('name', '')
    # XSS: using mark_safe on user input
    safe_name = mark_safe(f"<h1>Welcome, {name}</h1>")
    return HttpResponse(safe_name)

def render_comment(request):
    comment = request.POST.get('comment', '')
    # XSS: rendering user input without escaping
    html = f"<div class='comment'>{comment}</div>"
    return HttpResponse(mark_safe(html))

def dashboard(request):
    # Using |safe filter on user-controlled data
    context = {'user_input': request.GET.get('q', '')}
    return render(request, 'dashboard.html', context)
