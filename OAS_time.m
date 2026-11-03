clear; 
close all;


is_octave = (exist('OCTAVE_VERSION', 'builtin') > 0);
if  is_octave
    pkg load statistics;
    graphics_toolkit('fltk');
    pause(3);
end


%% Estado inicial |Psi(0)>

% Opciones para el switch: 
% 'Escogido', 'Aleatorio', 'Fock', 'Coherente' y 'Normal'.
t0=tic;
switch 'Normal'
    case 'Escogido'
        % Estado construido manualmente
        Psi_0           =   [1 -2 3 4];

    case 'Aleatorio'    
        % Estado construido aleatoriamente por Matlab.
        Psi_0           =   randn(79,1) + 1i*randn(79,1);

    case 'Fock'
        % Estado de número (o de Fock), uno de los eigenestados del OAS.
        n_lvl           =   20;
        nmax            =   2*n_lvl + 1;
        Psi_0           =   double((0:nmax) == n_lvl);

    case 'Coherente'
        % Estados coherentes: la forma algebraica de calcular los
        % coeficientes del estado Psi_0 sería
        % exp(-0.5*abs(alpha^2)).*(alpha.^nn)./sqrt(factorial(nn)), pero la
        % presencia de los factoriales y exponentes pueden generar
        % inestabilidad numérica. Nos basaremos en un evaluador de
        % probabilidades de Poisson. 
        % Consideraremos |alpha|<=25. Valores más altos generan
        % inestabilidad numérica.
        alpha           =   25*rand*exp(2i*pi*rand);
        mean_n          =   abs(alpha)^2;
        std_n           =   abs(alpha);
        nn              =   0:(mean_n + 5*std_n);
        Psi_0           =   sqrt(poisspdf( nn, abs(alpha)^2) )...
                                            .*exp(1i*nn*angle(alpha));

    case 'Normal'
        % Estado construido con base en una distribución normal
        mu              =   80;
        sigma           =   10;
        nn              =   0:(mu + 5*sigma);
        Psi_0           =   sqrt(normpdf(nn, mu, sigma));
end


% Normalización
Psi_0                   =   Psi_0(:)/norm(Psi_0);


%% Construcción de las eigenfunciones del OAS

% Definamos una posición adimensional u = sqrt(m*omega/hbar)*x. 
% Clásicamente, esperamos que |x| no supere el valor dado por la amplitud
% del oscilador, que es sqrt(2E/m*omega^2). Si consideramos que
% E~hbar*omega*(n+1/2), entonces |x| <= sqrt( (2*n+1)*hbar/(m*omega) ). En
% términos de la posición adimensional u, tendríamos que |u|<sqrt(2*n + 1).
% 
% En general, n no está bien definido. Podemos calcular un valor esperado
% para n y una desviación estándar, de modo que <n>+5*std(n) sea una
% estimación de un "n efectivo".  


% Valores de n usados. 
Nmax                    =   length(Psi_0)-1;
Nvec                    =   0:Nmax;
Nvec                    =   Nvec(:);

% Valor promedio de los n: 
%               <N>     =   <Psi| N |Psi>
%                       =   real(Psi_0'*diag(0:Nmax)*Psi_0);
%   Se puede optimizar como <N> = SUM_n n |<n|Psi_0>|^2.
abs_Psi0_2              =   abs(Psi_0).^2;
Nmean                   =   Nvec'*abs_Psi0_2;

% Valor promedio de los n^2: 
%               <N^2>   =   <Psi|N^2|Psi>
%                       =   real(Psi_0'*(diag(0:Nmax)^2)*Psi_0);
%   Se puede optimizar como <N> = SUM_n n^2 |<n|Psi_0>|^2.
N2mean                  =   (Nvec.^2)'*abs_Psi0_2;

% Desviación estándar en n: 
Nstd                    =   sqrt(N2mean - Nmean^2);

% "n efectivo". El término "sqrt(Nmean)" se usa para asegurar un mínimo. 
Neff                    =   Nmean + max(5*Nstd,sqrt(Nmean));    

% Límites del dominio a considerar. 
uMax                    =   sqrt(2*Neff+1);

% Con este uMax podemos construir un dominio para la posición u.
du                      =   uMax/(Neff+1);
Pts                     =   ceil(min(16*(Neff+1), 8192));
u                       =   linspace(-1,1,Pts)*uMax;

% Por otro lado, no existe una incerteza "clásica" en el valor de n.
% Podemos imaginar una región clásicamente permitida usando el valor
% medio de n, sin añadir efectos de incertidumbre. 
uCl                     =   sqrt(2*Nmean+1);


% Ahora podemos construir las eigenfunciones. Considerando que el uso de la
% variable adimensional u es equivalente a usar un sistema de unidades en
% el cual m*omega/hbar = 1, las constantes de normalización se simplifican
% un poco. Para esta construcción, necesitamos las dos primeras
% eigenfunciones (al menos son conocidas). 

phi_0                   =   exp(-0.5*u.^2)/sqrt(sqrt(pi));
phi_1                   =   (sqrt(2)*u).*exp(-0.5*u.^2)/sqrt(sqrt(pi));


% Construiremos una matriz Phi para reservar espacio en la memoria para las
% Nmax+1 eigenfunciones a utilizar. 

Phi                     =   zeros(length(u),Nmax+1);


% Y ahora usaremos phi_0 y phi_1, junto con la relación de recurrencia 
% phi_{n} = sqrt(2/n)*u*phi_{n-1} - sqrt((n-1)/n)*phi_{n-2}, 
% para construir las eigenfunciones necesarias. 

for n                   =   0:Nmax
    k                   =   n+1;
    if  n==0    
        Phi(:,k)        =   phi_0(:);
    elseif n==1
        Phi(:,k)        =   phi_1(:);
    else
        phi_nm2         =   Phi(:,k-2);
        phi_nm1         =   Phi(:,k-1);
        phi_n           =   sqrt(2/n).*u(:).*phi_nm1 ...
                                - sqrt((n-1)/n)*phi_nm2;
        Phi(:,k)        =   phi_n;
    end
end


%% Simulación de evolución temporal

% Tamaño de letra
fsz                     =   20;                   

% Valor máximo de psi(x,t) (para eje y). Se inicializa en cero.
psi_max                 =   0;                    


% "Handle" de la figura (ventana).
if  is_octave
    s                   =   get(0,'ScreenSize');
    Fig                 =   figure('Position',s);
else
    Fig                 =   figure('WindowState',"Maximized");
end
pause(0.5);


% Describamos el tiempo en función del período del oscilador: tau=t/T. 
for tau=0:0.005:10
    t1                  =   tic;
    
    % Matemáticamente, la evolución temporal del estado está dada por 
    % 
    %       |psi(t)>    =   U(t)|psi(0)> 
    %                   =   U(t) SUM_n |n><n|psi(0)> 
    %                   =   SUM_n U(t) |n><n|psi(0)> 
    %                   =   SUM_n exp(-2i*pi*tau*(n+0.5)) |n><n|psi(0)> 
    %                   =   SUM_n exp(-2i*pi*tau*(n+0.5)) <n|psi(0)> |n>. 
    % 
    % Así, podemos incluir la dependencia temporal simplemente como una
    % fase exp(-2i*pi*t*(n+0.5)) añadida a los coeficientes del estado
    % inicial.  
    
    Psi_t               =   Psi_0.*exp(-2i*pi*tau*(Nvec+0.5));
    
    
    %  Función de onda:
    % 
    %       psi(x,t)    =   <x|psi(t)> 
    %                   =   <x| SUM_n |n><n|psi(t)>
    %                   =   SUM_n <x|n> <n|psi(t)>
    %                   =   SUM_n phi_n(x) <n|psi(t)>. 
    % 
    % Un truco para hacer el cálculo más rápido y evitar el uso de un ciclo
    % FOR consiste en usar la matriz Phi con las eigenfunciones y hacer la 
    % siguiente operación: 

    Psi_xt              =   Phi*Psi_t;

    % Parte real, parte imaginaria y módulo (abs) al cuadrado.
    rPsi_xt             =   real(Psi_xt);
    iPsi_xt             =   imag(Psi_xt);
    aPsi_xt             =   rPsi_xt.^2 + iPsi_xt.^2;

    
    
    % Valores máximos previo y actual, para limitar el eje Y en los
    % graficos.
    psi_max_pre         =   psi_max;
    psi_max             =   max(psi_max, sqrt(max(aPsi_xt)) );
    

    % El siguiente código está estructurado en un condicional IF solo como
    % una estrategia para optimizar la ejecución y hacer que la animación
    % luzca más fluida. De otro modo, bastaría con usar la primera cláusula
    % de este condicional y aplicarla para todos los tau. 
    if  tau==0
        rr              =   6;
        cc              =   4;

        Nss             =   reshape(1:(rr*cc),[cc,rr])';
        Ns1             =   Nss(1:2,1:cc-1);
        ss1             =   subplot(rr,cc,[Ns1(1) Ns1(end)]);
        patch([-uCl -uCl uCl uCl],[-2 2 2 -2],[1 1 0.8]);
        set(gca,'Layer','top');
        hold on;
        pp1             =   plot(u(:),[rPsi_xt iPsi_xt]); 
        grid on;
        hold off;
        set(gca,'FontSize',fsz-6)
        xlabel('$u$, posici\''on adimensional.',...
                                'interpreter','latex','FontSize',fsz)
        ylabel('$\textrm{Re}(\psi(x,t))$',...
                                'interpreter','latex','FontSize',fsz)
        set(pp1(1),'LineWidth',5);
        set(pp1(2),'LineStyle','--');
        colorR          =   get(pp1(1),'Color');
        colorI          =   get(pp1(2),'Color');
        title('En amarillo: regi\''on cl\''asicamente permitida.',...
                'interpreter','latex','FontSize',fsz)
        

        Ns2             =   Nss(3:4,1:cc-1);
        ss2             =   subplot(rr,cc,[Ns2(1) Ns2(end)]);
        patch([-uCl -uCl uCl uCl],[-2 2 2 -2],[1 1 0.8]);
        set(gca,'Layer','top');
        hold on;
        pp2             =   plot(u(:),[iPsi_xt rPsi_xt]); 
        set(pp2,{'Color'},{colorI;colorR});
        grid on;
        hold off;
        set(gca,'FontSize',fsz-6)
        xlabel('$u$, posici\''on adimensional.',...
                                'interpreter','latex','FontSize',fsz)
        ylabel('$\textrm{Im}(\psi(x,t))$',...
                                'interpreter','latex','FontSize',fsz)
        set(pp2(1),'LineWidth',5);
        set(pp2(2),'LineStyle','--');
        
        Ns3             =   Nss(5:6,1:cc-1);
        ss3             =   subplot(rr,cc,[Ns3(1) Ns3(end)]);
        patch([-uCl -uCl uCl uCl],[-2 2 2 -2],[1 1 0.8]);
        set(gca,'Layer','top');
        hold on;
        pp3             =   plot(u(:),aPsi_xt,'k'); 
        grid on;
        hold off;
        set(gca,'FontSize',fsz-6)
        xlabel('$u$, posici\''on adimensional.',...
                                'interpreter','latex','FontSize',fsz)
        ylabel('$|\psi(x,t)|^2$','interpreter','latex','FontSize',fsz)
        set(pp3,'LineWidth',5);
        
        
        % Fijamos límites en el eje X. 
        xlims           =   [-1 1]*uMax;
        set([ss1;ss2;ss3],{'XLim'},{xlims;xlims;xlims});
    
        % Fijamos límites en el eje Y. 
        newLim1         =   [-1.05 1.05]*psi_max;
        newLim2         =   [-0.05 1.05]*(psi_max.^2);
        set([ss1; ss2; ss3], {'YLim'}, {newLim1;newLim1;newLim2});
        
        
    
    
        % Coeficientes del estado cuántico
        Ns4             =   Nss(1:3,end);
        ss4             =   subplot(rr,cc,[Ns4(1) Ns4(end)]);
        pp4             =   stem(Nvec,angle(Psi_0)/pi,'m','filled');
        xlim([-0.5, Nmax+0.5]);
        ylim([-1 1]);
        grid on;
        set(gca,'FontSize',fsz-6)
        xlabel('$n$','interpreter','latex','FontSize',fsz)
        ylabel('$\arg\left[c_n(t)\right]/\pi$', ...
            'interpreter','latex','FontSize',fsz);

        title('$c_n(t)= \langle\varphi_n|\Psi(t)\rangle$',...
                            'interpreter','latex','FontSize',fsz)


        Ns5             =   Nss(4:6,end);
        ss5             =   subplot(rr,cc,[Ns5(1) Ns5(end)]);
        pp5             =   stem(Nvec,abs(Psi_0.^2),'k','filled');
        xlim([-0.5, Nmax+0.5]);
        ylim([0 max(abs(Psi_0.^2))]);
        grid on;
        set(gca,'FontSize',fsz-6)
        xlabel('$n$','interpreter','latex','FontSize',fsz)
        ylabel('$|c_n(t)|^2$',...
            'interpreter','latex','FontSize',fsz);
        

        
        
        if ~is_octave
            disableDefaultInteractivity(ss1); 
            disableDefaultInteractivity(ss2);
            disableDefaultInteractivity(ss3); 
            disableDefaultInteractivity(ss5); 
            disableDefaultInteractivity(ss4); 
            set([ss1 ss2 ss3 ss4 ss5],...
                    'PositionConstraint','innerposition');
        end


    else
        % En lugar de generar un nuevo gráfico usando plot(...),
        % actualizamos los atributos del gráfico ya existente.
        % Esto resulta en una animación mucho más fluida. 
        set([pp1(1); ...
             pp1(2); ...
             pp2(1); ...
             pp2(2); ...
             pp3   ], ...
                     {'YData'}, {rPsi_xt; ...
                                 iPsi_xt; ...
                                 iPsi_xt; ...
                                 rPsi_xt; ...
                                 aPsi_xt});

        % No es necesario actualizar |c_n|^2 porque se mantienen fijos.
        % Solo actualizamos la fase de los c_n. 
        set(pp4,'YData',angle(Psi_t)/pi);

        if  psi_max     >   psi_max_pre
            newLim1     =   [-1.05 1.05]*psi_max;
            newLim2     =   [-0.05 1.05]*(psi_max.^2);
            set([ss1; ss2; ss3], {'YLim'}, {newLim1;newLim1;newLim2});
        end
        drawnow;
    end
    
    % Una pausa infinitesimal para que la animación no se "buguee".
    % No debería ser necesaria debido al "drawnow;" unas líneas antes,
    % pero puede ocurrir que la transición sea muy rápida y no alcance a
    % verse. 
    if toc(t1)<0.0005
        pause(0.0001)
    end
end
toc(t0);
